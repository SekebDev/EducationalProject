import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import pg from 'pg';
import type { AppConfig } from '../config.js';
import { PublicError } from '../http/public-error.js';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function objectKey(ownerId: string, materialId: string): string {
  if (!uuidPattern.test(ownerId) || !uuidPattern.test(materialId)) {
    throw new TypeError('ID inválido');
  }
  return `${ownerId}/${materialId}`;
}

export class MaterialStorage {
  private readonly s3: S3Client | undefined;
  private readonly root: string;

  constructor(
    private readonly pool: pg.Pool | pg.PoolClient,
    private readonly config: AppConfig,
  ) {
    this.root = resolve(config.storageLocalPath);
    if (config.storageDriver === 's3') {
      if (!config.s3Bucket || !config.s3Region) {
        throw new Error('S3 sem bucket ou região');
      }
      this.s3 = new S3Client({ region: config.s3Region });
    }
  }

  async put(
    ownerId: string,
    materialId: string,
    content: Uint8Array,
  ): Promise<void> {
    if (content.byteLength < 1 || content.byteLength > 20_000_000) {
      throw new PublicError(
        413,
        'FILE_SIZE_INVALID',
        'Arquivo fora do limite de 20 MB.',
      );
    }
    const key = await this.activeKey(ownerId, materialId);
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.s3Bucket,
          Key: key,
          Body: content,
          ServerSideEncryption: 'AES256',
        }),
      );
    } else {
      const directory = join(this.root, ownerId);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(join(directory, materialId), content, {
        flag: 'wx',
        mode: 0o600,
      });
    }
  }

  async read(ownerId: string, materialId: string): Promise<Uint8Array> {
    const key = await this.activeKey(ownerId, materialId);
    if (this.s3) {
      const result = await this.s3.send(
        new GetObjectCommand({ Bucket: this.config.s3Bucket, Key: key }),
      );
      if (!result.Body) {
        throw new PublicError(
          503,
          'STORAGE_UNAVAILABLE',
          'Arquivo indisponível.',
          true,
        );
      }
      return result.Body.transformToByteArray();
    }
    return readFile(join(this.root, ownerId, materialId));
  }

  async purge(key: string): Promise<void> {
    const [ownerId, materialId] = key.split('/');
    if (!ownerId || !materialId || objectKey(ownerId, materialId) !== key) {
      throw new TypeError('Chave inválida');
    }
    if (this.s3) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.config.s3Bucket, Key: key }),
      );
    } else {
      await rm(join(this.root, ownerId, materialId), { force: true });
    }
  }

  private async activeKey(
    ownerId: string,
    materialId: string,
  ): Promise<string> {
    const result = await this.pool.query<{ object_key: string }>(
      'SELECT object_key FROM material WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL',
      [ownerId, materialId],
    );
    const key = result.rows[0]?.object_key;
    if (!key || key !== objectKey(ownerId, materialId)) {
      throw new PublicError(404, 'NOT_FOUND', 'Material não encontrado.');
    }
    return key;
  }
}
