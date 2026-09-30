import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { readConfig } from './infrastructure/config.js';
import { loadLocalEnv } from './infrastructure/load-env.js';
import { PublicErrorFilter } from './infrastructure/http/public-error.js';
import { requestLogging } from './infrastructure/http/request-logging.js';
import { csrfProtection } from './infrastructure/http/csrf.js';

async function main(): Promise<void> {
  loadLocalEnv();
  const config = readConfig(process.env);
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.use(requestLogging);
  app.use(csrfProtection(config.appOrigin));
  app.useGlobalFilters(new PublicErrorFilter());
  app.enableShutdownHooks();
  await app.listen(
    config.apiPort,
    config.apiHost ??
      (config.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1'),
  );
}

void main();
