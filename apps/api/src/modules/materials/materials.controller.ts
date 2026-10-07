import { ResourceIdPipe } from '../../infrastructure/http/resource-id.pipe.js';
import { SessionGuard } from '../auth/session.guard.js';
import { CurrentStudent } from '../auth/current-student.decorator.js';
import type { CurrentStudentEntity } from '../auth/entities/student.entity.js';
import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MaterialsService } from './materials.service.js';
import { readMaterialUpload } from './upload.js';

@UseGuards(SessionGuard)
@Controller('api/v1')
export class MaterialsController {
  constructor(
    @Inject(MaterialsService) private readonly materials: MaterialsService,
  ) {}

  @Post('conversations/:id/materials')
  @HttpCode(202)
  async upload(
    @CurrentStudent() student: CurrentStudentEntity,
    @Req() request: Request,
    @Param('id', new ResourceIdPipe('Material não encontrado.'))
    conversationId: string,
    @Headers('idempotency-key') key: string,
  ) {
    const file = await readMaterialUpload(request);
    return this.materials.upload(student.id, conversationId, key, file);
  }

  @Get('conversations/:id/materials')
  async list(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Material não encontrado.'))
    conversationId: string,
  ) {
    return this.materials.list(student.id, conversationId);
  }

  @Get('materials/:id')
  async get(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Material não encontrado.')) id: string,
  ) {
    return this.materials.get(student.id, id);
  }

  @Get('materials/:id/content')
  async content(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Material não encontrado.')) id: string,
    @Res() response: Response,
  ) {
    const { metadata, bytes } = await this.materials.content(student.id, id);
    response.setHeader(
      'Content-Type',
      metadata.mime ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.end(Buffer.from(bytes));
  }

  @Get('materials/:id/chunks/:chunkId')
  async chunk(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Material não encontrado.')) id: string,
    @Param('chunkId', new ResourceIdPipe('Material não encontrado.'))
    chunkId: string,
  ) {
    return this.materials.chunk(student.id, id, chunkId);
  }

  @Delete('materials/:id')
  @HttpCode(204)
  async delete(
    @CurrentStudent() student: CurrentStudentEntity,
    @Param('id', new ResourceIdPipe('Material não encontrado.')) id: string,
  ): Promise<void> {
    await this.materials.delete(student.id, id);
  }
}
