import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { getCookie } from '../../infrastructure/http/cookies.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { ConversationsService } from './conversations.service.js';
import { personalities } from './personalities.js';
import { SourcesService } from './sources.service.js';

const personalitySchema = z.enum(['acolhedora', 'objetiva', 'socratica']);
const createSchema = z.strictObject({
  personality: personalitySchema,
  title: z.string().trim().min(1).max(120).optional(),
});
const updateSchema = z.strictObject({
  personality: personalitySchema.optional(),
  title: z.string().trim().min(1).max(120).optional(),
  version: z.number().int().min(1),
});
const sendSchema = z.strictObject({
  content: z.string().trim().min(1).max(12_000),
  conversationVersion: z.number().int().min(1),
});
const sourcesSchema = z.strictObject({
  materialIds: z.array(z.uuid()).max(10),
  version: z.number().int().min(1),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new PublicError(
      422,
      'VALIDATION_FAILED',
      'Confira os campos informados.',
    );
  }
  return result.data;
}

function uuid(value: string): string {
  if (!z.uuid().safeParse(value).success) {
    throw new PublicError(404, 'NOT_FOUND', 'Conversa não encontrada.');
  }
  return value;
}

@Controller('api/v1')
export class ConversationsController {
  constructor(
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(ConversationsService)
    private readonly conversations: ConversationsService,
    @Inject(SourcesService)
    private readonly sources: SourcesService,
  ) {}

  @Get('personalities')
  async personalities(@Req() request: Request) {
    await this.student(request);
    return Object.values(personalities).map(({ key, name, description }) => ({
      key,
      name,
      description,
    }));
  }

  @Post('conversations')
  async create(
    @Req() request: Request,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    const student = await this.student(request);
    return this.conversations.create(
      student.id,
      key,
      parse(createSchema, body),
    );
  }

  @Get('conversations')
  async list(@Req() request: Request, @Query('cursor') cursor?: string) {
    const student = await this.student(request);
    return this.conversations.list(student.id, cursor);
  }

  @Get('conversations/:id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const student = await this.student(request);
    return this.conversations.get(student.id, uuid(id));
  }

  @Patch('conversations/:id')
  async update(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const student = await this.student(request);
    return this.conversations.update(
      student.id,
      uuid(id),
      parse(updateSchema, body),
    );
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  async delete(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<void> {
    const student = await this.student(request);
    await this.conversations.delete(student.id, uuid(id));
  }

  @Get('conversations/:id/messages')
  async messages(
    @Req() request: Request,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    const student = await this.student(request);
    const after = cursor ? Number(cursor) : 0;
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new PublicError(400, 'CURSOR_INVALID', 'Página inválida.');
    }
    return this.conversations.messages(student.id, uuid(id), after);
  }

  @Put('conversations/:id/sources')
  async selectSources(
    @Req() request: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const student = await this.student(request);
    const input = parse(sourcesSchema, body);
    return this.sources.select(
      student.id,
      uuid(id),
      input.version,
      input.materialIds,
    );
  }

  @Post('conversations/:id/messages')
  @HttpCode(202)
  async send(
    @Req() request: Request,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body() body: unknown,
  ) {
    const student = await this.student(request);
    return this.conversations.sendMessage(
      student.id,
      uuid(id),
      key,
      parse(sendSchema, body),
    );
  }

  private student(request: Request) {
    return this.auth.currentStudent(getCookie(request, 'study_session'));
  }
}
