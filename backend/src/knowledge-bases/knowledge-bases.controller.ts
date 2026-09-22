import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto.js';
import { KnowledgeBasesService } from './knowledge-bases.service.js';

const allowedExtensions = new Set(['txt', 'md', 'pdf']);

@Controller('api/knowledge-bases')
export class KnowledgeBasesController {
  constructor(private readonly knowledgeBases: KnowledgeBasesService) {}

  @Post()
  create(@Body() dto: CreateKnowledgeBaseDto) {
    return this.knowledgeBases.create(dto);
  }

  @Get()
  findAll() {
    return this.knowledgeBases.findAll();
  }

  @Get(':knowledgeBaseId/documents')
  findDocuments(@Param('knowledgeBaseId') knowledgeBaseId: string) {
    return this.knowledgeBases.findDocuments(knowledgeBaseId);
  }

  @Post(':knowledgeBaseId/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
        if (!allowedExtensions.has(extension)) {
          callback(new BadRequestException('只支持 TXT、Markdown 和 PDF 文件'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  upload(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('请选择要上传的文件');
    return this.knowledgeBases.createDocument(knowledgeBaseId, file);
  }

  @Get(':knowledgeBaseId/documents/:documentId/parse')
  getDocumentParse(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.knowledgeBases.getDocumentParse(knowledgeBaseId, documentId);
  }

  @Post(':knowledgeBaseId/documents/:documentId/parse')
  parseDocument(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.knowledgeBases.parseDocument(knowledgeBaseId, documentId);
  }

  @Get(':knowledgeBaseId/documents/:documentId/chunks')
  findChunks(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.knowledgeBases.findChunks(knowledgeBaseId, documentId);
  }

  @Post(':knowledgeBaseId/documents/:documentId/chunks')
  createChunks(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.knowledgeBases.createChunks(knowledgeBaseId, documentId);
  }

  @Get(':knowledgeBaseId/documents/:documentId/file')
  async getDocumentFile(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('documentId') documentId: string,
  ) {
    const file = await this.knowledgeBases.getDocumentFile(knowledgeBaseId, documentId);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    });
  }

  @Delete(':knowledgeBaseId/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDocument(
    @Param('knowledgeBaseId') knowledgeBaseId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.knowledgeBases.removeDocument(knowledgeBaseId, documentId);
  }
}
