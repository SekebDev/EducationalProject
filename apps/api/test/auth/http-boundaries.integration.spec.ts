import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Controller, Get, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  PublicError,
  PublicErrorFilter,
} from '../../src/infrastructure/http/public-error.js';
import { OperationsController } from '../../src/infrastructure/jobs/operations.controller.js';
import { AuthController } from '../../src/modules/auth/auth.controller.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { AuthRateLimit } from '../../src/modules/auth/rate-limit.js';
import { SessionGuard } from '../../src/modules/auth/session.guard.js';
import { CurrentStudent } from '../../src/modules/auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../../src/modules/auth/entities/student.entity.js';
import { ConversationsController } from '../../src/modules/conversations/conversations.controller.js';
import { ConversationsService } from '../../src/modules/conversations/conversations.service.js';
import { SourcesService } from '../../src/modules/conversations/sources.service.js';
import { AttemptsController } from '../../src/modules/attempts/attempts.controller.js';
import { AttemptsService } from '../../src/modules/attempts/attempts.service.js';
import { SubmissionService } from '../../src/modules/attempts/submission.service.js';
import { ExamsController } from '../../src/modules/exams/exams.controller.js';
import { ExamsService } from '../../src/modules/exams/exams.service.js';
import { MaterialsController } from '../../src/modules/materials/materials.controller.js';
import { MaterialsService } from '../../src/modules/materials/materials.service.js';
import { GradingController } from '../../src/modules/grading/grading.controller.js';
import { DisputesService } from '../../src/modules/grading/disputes.service.js';
import { InsightsController } from '../../src/modules/insights/insights.controller.js';
import { RecommendationsService } from '../../src/modules/insights/recommendations.service.js';
import { PracticeController } from '../../src/modules/insights/practice.controller.js';
import { PracticeService } from '../../src/modules/insights/practice.service.js';

const student: CurrentStudentEntity = {
  id: randomUUID(),
  email: 'student@example.invalid',
  timezone: 'America/Sao_Paulo',
};
const auth = {
  currentStudent: vi.fn(async (token: string | undefined) => {
    if (token !== 'valid-session') {
      throw new PublicError(401, 'UNAUTHENTICATED', 'Entre para continuar.');
    }
    return student;
  }),
};
const conversations = {
  create: vi.fn(async () => ({ id: randomUUID() })),
  get: vi.fn(async () => ({ id: randomUUID() })),
};

@Module({
  providers: [{ provide: AuthService, useValue: auth }, SessionGuard],
  exports: [AuthService, SessionGuard],
})
class SessionFixtureModule {}

@Controller('fixture')
class UnguardedController {
  @Get()
  get(@CurrentStudent() current: CurrentStudentEntity) {
    return current;
  }
}

@Module({
  imports: [SessionFixtureModule],
  controllers: [
    AuthController,
    ConversationsController,
    AttemptsController,
    ExamsController,
    MaterialsController,
    GradingController,
    InsightsController,
    PracticeController,
    OperationsController,
    UnguardedController,
  ],
  providers: [
    AuthRateLimit,
    { provide: ConversationsService, useValue: conversations },
    ...[
      SourcesService,
      AttemptsService,
      SubmissionService,
      ExamsService,
      MaterialsService,
      DisputesService,
      RecommendationsService,
      PracticeService,
    ].map((provide) => ({ provide, useValue: {} })),
  ],
})
class HttpFixtureModule {}

describe('HTTP authentication and DTO boundaries', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    for (const [name, value] of Object.entries({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
      APP_ORIGIN: 'http://localhost:3000',
      SESSION_SECRET: 'test-only-123456789012345678901234',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'study@example.invalid',
    })) {
      vi.stubEnv(name, value);
    }
    app = await NestFactory.create(HttpFixtureModule, {
      logger: false,
      abortOnError: false,
    });
    app.useGlobalFilters(new PublicErrorFilter());
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });

  it.each([
    '/auth/me',
    '/personalities',
    '/conversations',
    '/attempts',
    '/exams',
    `/materials/${randomUUID()}`,
    `/answers/${randomUUID()}/grade-revisions`,
    '/insights',
    `/recommendations/${randomUUID()}`,
    `/operations/${randomUUID()}`,
  ])('protects %s with the session guard', async (path) => {
    const response = await fetch(`${base}/api/v1${path}`);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('resolves the current student once and rechecks the next request', async () => {
    const response = await fetch(`${base}/api/v1/auth/me`, {
      headers: { cookie: 'study_session=valid-session' },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(student);
    expect(auth.currentStudent).toHaveBeenCalledExactlyOnceWith(
      'valid-session',
    );
    expect(
      (
        await fetch(`${base}/api/v1/auth/me`, {
          headers: { cookie: 'study_session=revoked-session' },
        })
      ).status,
    ).toBe(401);
  });

  it('keeps the CSRF endpoint public and the student decorator fail closed', async () => {
    expect((await fetch(`${base}/api/v1/auth/csrf`)).status).toBe(200);
    expect((await fetch(`${base}/fixture`)).status).toBe(401);
    expect(auth.currentStudent).not.toHaveBeenCalled();
  });

  it('normalizes the DTO and forwards the authenticated owner to the service', async () => {
    const key = randomUUID();
    const response = await fetch(`${base}/api/v1/conversations`, {
      method: 'POST',
      headers: {
        cookie: 'study_session=valid-session',
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ personality: 'socratica', title: '  Biologia  ' }),
    });
    expect(response.status).toBe(201);
    expect(conversations.create).toHaveBeenCalledExactlyOnceWith(
      student.id,
      key,
      { personality: 'socratica', title: 'Biologia' },
    );
    expect(auth.currentStudent).toHaveBeenCalledTimes(1);
  });

  it.each([
    { personality: 'unknown' },
    { personality: 'socratica', ownerId: randomUUID() },
    { personality: 'socratica', title: '   ' },
  ])(
    'rejects invalid or extra fields before calling the service',
    async (body) => {
      const response = await fetch(`${base}/api/v1/conversations`, {
        method: 'POST',
        headers: {
          cookie: 'study_session=valid-session',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(conversations.create).not.toHaveBeenCalled();
    },
  );

  it('authenticates before validation and rejects invalid resource IDs', async () => {
    const url = `${base}/api/v1/conversations/not-a-uuid`;
    expect((await fetch(url)).status).toBe(401);
    const response = await fetch(url, {
      headers: { cookie: 'study_session=valid-session' },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Conversa não encontrada.' },
    });
    expect(conversations.get).not.toHaveBeenCalled();
  });

  it.each([
    ['/auth/login', 'INVALID_CREDENTIALS_FORMAT'],
    ['/auth/password-reset', 'INVALID_EMAIL'],
    ['/auth/password-reset/confirm', 'INVALID_RESET'],
    ['/exams', 'INVALID_EXAM_CONFIG'],
    [`/recommendations/${randomUUID()}/practice`, 'INVALID_PRACTICE'],
    [`/answers/${randomUUID()}/disputes`, 'DISPUTE_INVALID'],
    [`/attempts/${randomUUID()}/submit`, 'SUBMISSION_INVALID'],
    [
      `/attempts/${randomUUID()}/answers/${randomUUID()}/confirm`,
      'ANSWER_INVALID',
    ],
  ])('preserves the validation error for %s', async (path, code) => {
    const response = await fetch(`${base}/api/v1${path}`, {
      method: 'POST',
      headers: {
        cookie: 'study_session=valid-session',
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code } });
  });
});
