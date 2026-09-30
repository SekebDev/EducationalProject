import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    API_HOST: z.enum(['127.0.0.1', '0.0.0.0']).optional(),
    DATABASE_URL: z.url().startsWith('postgres://'),
    APP_ORIGIN: z.url(),
    SESSION_SECRET: z.string().min(32),
    AI_PROVIDER: z.enum(['fake', 'openai']).default('fake'),
    OPENAI_API_KEY: z.string().optional(),
    AI_MAX_INPUT_CHARS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(1_000_000)
      .default(120_000),
    AI_MAX_OUTPUT_TOKENS: z.coerce
      .number()
      .int()
      .min(256)
      .max(12_000)
      .default(12_000),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_FROM: z.email(),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_PATH: z.string().min(1).default('.local-storage'),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      environment.AI_PROVIDER === 'fake'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message: 'Produção exige provedor real',
      });
    }
    if (environment.AI_PROVIDER === 'openai' && !environment.OPENAI_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'Chave obrigatória para OpenAI',
      });
    }
    if (
      environment.NODE_ENV === 'production' &&
      environment.STORAGE_DRIVER !== 's3'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['STORAGE_DRIVER'],
        message: 'Produção exige S3 privado',
      });
    }
    if (
      environment.STORAGE_DRIVER === 's3' &&
      (!environment.S3_BUCKET || !environment.S3_REGION)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['S3_BUCKET'],
        message: 'Bucket e região são obrigatórios',
      });
    }
  });

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  apiPort: number;
  apiHost?: '127.0.0.1' | '0.0.0.0';
  databaseUrl: string;
  appOrigin: string;
  sessionSecret: string;
  aiProvider: 'fake' | 'openai';
  openAiApiKey?: string;
  aiMaxInputChars?: number;
  aiMaxOutputTokens?: number;
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
  storageDriver: 'local' | 's3';
  storageLocalPath: string;
  s3Bucket?: string;
  s3Region?: string;
};

export function readConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => issue.path.join('.'))
      .join(', ');
    throw new Error(`Configuração inválida: ${fields}`);
  }
  const value = result.data;
  return {
    nodeEnv: value.NODE_ENV,
    apiPort: value.API_PORT,
    apiHost:
      value.API_HOST ??
      (value.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
    databaseUrl: value.DATABASE_URL,
    appOrigin: value.APP_ORIGIN,
    sessionSecret: value.SESSION_SECRET,
    aiProvider: value.AI_PROVIDER,
    ...(value.OPENAI_API_KEY ? { openAiApiKey: value.OPENAI_API_KEY } : {}),
    aiMaxInputChars: value.AI_MAX_INPUT_CHARS,
    aiMaxOutputTokens: value.AI_MAX_OUTPUT_TOKENS,
    smtpHost: value.SMTP_HOST,
    smtpPort: value.SMTP_PORT,
    smtpFrom: value.SMTP_FROM,
    storageDriver: value.STORAGE_DRIVER,
    storageLocalPath: value.STORAGE_LOCAL_PATH,
    ...(value.S3_BUCKET ? { s3Bucket: value.S3_BUCKET } : {}),
    ...(value.S3_REGION ? { s3Region: value.S3_REGION } : {}),
  };
}
