import { ResourceIdPipe } from '../../infrastructure/http/resource-id.pipe.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentStudent } from '../auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../auth/entities/student.entity.js';
import { ZodValidationPipe } from '../../infrastructure/http/zod-validation.pipe.js';
import {
  createSchema,
  updateSchema,
  sendSchema,
  sourcesSchema,
} from './dto/conversations.dto.js';
import type {
  CreateConversationDto,
  UpdateConversationDto,
  SendMessageDto,
  SelectSourcesDto,
} from './dto/conversations.dto.js';
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
  UseGuards,
} from '@nestjs/common';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { ConversationsService } from './conversations.service.js';
import { personalities } from './personalities.js';
import { SourcesService } from './sources.service.js';

@UseGuards(SessionGuard)
@Controller('api/v1')
export class ConversationsController {
  constructor(
    @Inject(ConversationsService)
    private readonly conversations: ConversationsService,
    @Inject(SourcesService)
    private readonly sources: SourcesService,
  ) {}

  @Get('personalities')
  async personalities() {
    return Object.values(personalities).map(({ key, name, description }) => ({
      key,
      name,
      description,
    }));
  }

  @Post('conversations')
  async create(
    @CurrentStudent() student: CurrentStudentEntity,
    @Headers('idempotency-key') key: string,
    @Body(new ZodValidationPipe(createSchema)) body: CreateConversationDto,
  ) {
    return this.conversations.create(student.id, key, body);
  }

  @Get('conversations')
  async list(
    @CurrentStudent() student: CurrentStudentEntity,
    @Query('cursor') cursor?: string,
  ) {
    return this.conversations.list(student.id, cursor);
  }

  @Get('conversations/:id')
  async get(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Conversa não encontrada.')) id: string,
  ) {
    return this.conversations.get(student.id, id);
  }

  @Patch('conversations/:id')
  async update(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Conversa não encontrada.')) id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateConversationDto,
  ) {
    return this.conversations.update(student.id, id, body);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  async delete(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Conversa não encontrada.')) id: string,
  ): Promise<void> {
    await this.conversations.delete(student.id, id);
  }

  @Get('conversations/:id/messages')
  async messages(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Conversa não encontrada.')) id: string,
    @Query('cursor') cursor?: string,
  ) {
    const after = cursor ? Number(cursor) : 0;
    if (!Number.isSafeInteger(after) || after < 0) {
      throw new PublicError(400, 'CURSOR_INVALID', 'Página inválida.');
    }
    return this.conversations.messages(student.id, id, after);
  }

  @Put('conversations/:id/sources')
  async selectSources(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Conversa não encontrada.')) id: string,
    @Body(new ZodValidationPipe(sourcesSchema)) body: SelectSourcesDto,
  ) {
    return this.sources.select(student.id, id, body.version, body.materialIds);
  }

  @Post('conversations/:id/messages')
  @HttpCode(202)
  async send(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Conversa não encontrada.')) id: string,
    @Headers('idempotency-key') key: string,
    @Body(new ZodValidationPipe(sendSchema)) body: SendMessageDto,
  ) {
    return this.conversations.sendMessage(student.id, id, key, body);
  }
}
