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
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { getCookie } from '../../infrastructure/http/cookies.js';
import { PublicError } from '../../infrastructure/http/public-error.js';
import { MaterialsService } from './materials.service.js';
import { readMaterialUpload } from './upload.js';

function uuid(value: string): string {
  if (!z.uuid().safeParse(value).success) {
    throw new PublicError(404, 'NOT_FOUND', 'Material não encontrado.');
  }
  return value;
}

@Controller('api/v1')
export class MaterialsController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MaterialsService) private readonly materials: MaterialsService,
  ) {}

  @Post('conversations/:id/materials')
  @HttpCode(202)
  async upload(
    @Req() request: Request,
    @Param('id') conversationId: string,
    @Headers('idempotency-key') key: string,
  ) {
    const student = await this.student(request);
    const file = await readMaterialUpload(request);
    return this.materials.upload(student.id, uuid(conversationId), key, file);
  }

  @Get('conversations/:id/materials')
  async list(@Req() request: Request, @Param('id') conversationId: string) {
    const student = await this.student(request);
    return this.materials.list(student.id, uuid(conversationId));
  }

  @Get('materials/:id')
  async get(@Req() request: Request, @Param('id') id: string) {
    const student = await this.student(request);
    return this.materials.get(student.id, uuid(id));
  }

  @Get('materials/:id/content')
  async content(
    @Req() request: Request,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const student = await this.student(request);
    const { metadata, bytes } = await this.materials.content(
      student.id,
      uuid(id),
    );
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
    @Req() request: Request,
    @Param('id') id: string,
    @Param('chunkId') chunkId: string,
  ) {
    const student = await this.student(request);
    return this.materials.chunk(student.id, uuid(id), uuid(chunkId));
  }

  @Delete('materials/:id')
  @HttpCode(204)
  async delete(
    @Req() request: Request,
    @Param('id') id: string,
  ): Promise<void> {
    const student = await this.student(request);
    await this.materials.delete(student.id, uuid(id));
  }

  private student(request: Request) {
    return this.auth.currentStudent(getCookie(request, 'study_session'));
  }
}
