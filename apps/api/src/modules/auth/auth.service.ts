import { randomBytes, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import pg from 'pg';
import nodemailer from 'nodemailer';
import { createPool, transaction } from '../../infrastructure/db/pool.js';
import { readConfig } from '../../infrastructure/config.js';
import { PublicError } from '../../infrastructure/http/public-error.js';

import type {
  CurrentStudentEntity,
  StudentEntity,
} from './entities/student.entity.js';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly config = readConfig(process.env);
  private readonly pool = createPool(this.config.databaseUrl);

  async register(
    emailInput: string,
    password: string,
    csrfToken: string,
  ): Promise<{ student: CurrentStudentEntity; token: string }> {
    const email = emailInput.trim().toLowerCase();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const token = randomBytes(32).toString('base64url');
    try {
      const student = await transaction(this.pool, async (client) => {
        const registered = await client.query<CurrentStudentEntity>(
          'INSERT INTO student (email,password_hash) VALUES ($1,$2) RETURNING id,email,timezone',
          [email, passwordHash],
        );
        const result = registered.rows[0];
        if (!result) {
          throw new Error('Cadastro sem resultado');
        }
        await this.insertSession(client, result.id, token, csrfToken);
        return result;
      });
      return { student, token };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === '23505') {
        throw new PublicError(
          409,
          'EMAIL_IN_USE',
          'Este e-mail já está cadastrado.',
        );
      }
      throw error;
    }
  }

  async login(
    emailInput: string,
    password: string,
    csrfToken: string,
  ): Promise<{ student: CurrentStudentEntity; token: string }> {
    const email = emailInput.trim().toLowerCase();
    const found = await this.pool.query<StudentEntity>(
      'SELECT id,email,timezone,password_hash FROM student WHERE email=$1',
      [email],
    );
    const row = found.rows[0];
    if (!row || !(await argon2.verify(row.password_hash, password))) {
      throw new PublicError(
        401,
        'INVALID_CREDENTIALS',
        'E-mail ou senha inválidos.',
      );
    }
    const token = randomBytes(32).toString('base64url');
    await transaction(this.pool, async (client) => {
      // Serialize session creation with password changes, without holding a lock during Argon2.
      const current = await client.query<{ password_hash: string }>(
        'SELECT password_hash FROM student WHERE id=$1 FOR UPDATE',
        [row.id],
      );
      if (current.rows[0]?.password_hash !== row.password_hash) {
        throw new PublicError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
      }
      await this.insertSession(client, row.id, token, csrfToken);
    });
    return {
      student: { id: row.id, email: row.email, timezone: row.timezone },
      token,
    };
  }

  async currentStudent(
    token: string | undefined,
  ): Promise<CurrentStudentEntity> {
    if (!token) {
      throw new PublicError(401, 'UNAUTHENTICATED', 'Entre para continuar.');
    }
    const result = await this.pool.query<CurrentStudentEntity>(
      `SELECT st.id,st.email,st.timezone FROM session s JOIN student st ON st.id=s.student_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [hashToken(token)],
    );
    const student = result.rows[0];
    if (!student) {
      throw new PublicError(401, 'UNAUTHENTICATED', 'Entre para continuar.');
    }
    return student;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }
    await this.pool.query(
      'UPDATE session SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',
      [hashToken(token)],
    );
  }

  async requestPasswordReset(emailInput: string): Promise<void> {
    const email = emailInput.trim().toLowerCase();
    const student = await this.pool.query<{ id: string }>(
      'SELECT id FROM student WHERE email=$1',
      [email],
    );
    const id = student.rows[0]?.id;
    if (!id) {
      return;
    }
    const token = randomBytes(32).toString('base64url');
    await transaction(this.pool, async (client) => {
      await client.query('SELECT id FROM student WHERE id=$1 FOR UPDATE', [id]);
      await client.query('UPDATE password_reset SET used_at=now() WHERE student_id=$1 AND used_at IS NULL', [id]);
      await client.query(
        "INSERT INTO password_reset(student_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '15 minutes')",
        [id, hashToken(token)],
      );
    });
    const transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
    });
    await transporter.sendMail({
      from: this.config.smtpFrom,
      to: email,
      subject: 'Redefinição de senha',
      text: `Use este link em até 15 minutos: ${this.config.appOrigin}/recuperar-senha?token=${encodeURIComponent(token)}`,
    });
  }

  async confirmPasswordReset(
    token: string,
    newPassword: string,
  ): Promise<void> {
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });
    await transaction(this.pool, async (client) => {
      const owner = await client.query<{ student_id: string }>(
        'SELECT student_id FROM password_reset WHERE token_hash=$1', [hashToken(token)],
      );
      if (!owner.rows[0]) {
        throw new PublicError(422, 'RESET_INVALID', 'Link inválido ou expirado.');
      }
      // Use the same lock order for issuing links, consuming links and creating sessions.
      await client.query('SELECT id FROM student WHERE id=$1 FOR UPDATE', [owner.rows[0].student_id]);
      const result = await client.query<{ id: string; student_id: string }>(
        'SELECT id,student_id FROM password_reset WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE',
        [hashToken(token)],
      );
      const row = result.rows[0];
      if (!row) {
        throw new PublicError(
          422,
          'RESET_INVALID',
          'Link inválido ou expirado.',
        );
      }
      await client.query('UPDATE student SET password_hash=$1 WHERE id=$2', [
        passwordHash,
        row.student_id,
      ]);
      await client.query(
        'UPDATE password_reset SET used_at=now() WHERE student_id=$1 AND used_at IS NULL',
        [row.student_id],
      );
      await client.query(
        'UPDATE session SET revoked_at=now() WHERE student_id=$1 AND revoked_at IS NULL',
        [row.student_id],
      );
    });
  }

  private async insertSession(
    database: pg.Pool | pg.PoolClient,
    studentId: string,
    token: string,
    csrfToken: string,
  ): Promise<void> {
    await database.query(
      `INSERT INTO session(student_id,token_hash,csrf_hash,expires_at)
       VALUES ($1,$2,$3,now()+interval '7 days')`,
      [studentId, hashToken(token), hashToken(csrfToken)],
    );
  }
}
