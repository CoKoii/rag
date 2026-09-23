import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { basename, extname } from 'node:path';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../entities/document.entity.js';
import { LocalStorageService } from '../local-storage.service.js';
import { MarkdownParser } from './md.js';
import { QwenImageUnderstandingService } from './qwen-image-understanding.service.js';
import type { DocumentParser } from './shared/document-parser.js';
import type { ParsedDocument, ParsedNode } from './shared/parsed-tree.js';

/** 解析器入口：按文件扩展名选择具体解析器。 */
@Injectable()
export class DocumentParseService {
  private readonly markdownParser = new MarkdownParser();

  private readonly parsers = new Map<string, DocumentParser>([
    ['md', this.markdownParser],
    ['markdown', this.markdownParser],
  ]);

  private readonly imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp']);

  constructor(
    private readonly storage: LocalStorageService,
    private readonly imageUnderstanding: QwenImageUnderstandingService,
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
  ) {}

  canParse(fileName: string): boolean {
    const extension = this.extensionOf(fileName);
    return this.parsers.has(extension) || this.imageExtensions.has(extension);
  }

  async parse(document: DocumentEntity): Promise<ParsedDocument> {
    const extension = this.extensionOf(document.originalName);
    if (this.imageExtensions.has(extension)) {
      const image = await this.readImage(document.storagePath, extension);
      const description = await this.imageUnderstanding.describe(
        image.buffer,
        image.mimeType,
      );
      return {
        type: 'document',
        attrs: {},
        children: [
          {
            type: 'image',
            attrs: {
              src: document.originalName,
              alt: description,
              mimeType: image.mimeType,
            },
            children: [],
          },
        ],
      };
    }

    const parser = this.parsers.get(extension);
    if (!parser)
      throw new BadRequestException('当前只支持解析 Markdown 和图片文件');

    let source: Buffer;
    try {
      source = await this.storage.read(document.storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new BadRequestException('本地文件不存在，请重新上传');
      }
      throw error;
    }
    const parsed = parser.parse(source.toString('utf8'));
    await this.enrichMarkdownImages(parsed, document.knowledgeBaseId);
    return parsed;
  }

  private async enrichMarkdownImages(
    parsed: ParsedDocument,
    knowledgeBaseId: string,
  ): Promise<void> {
    const candidates = await this.documents.find({
      where: { knowledgeBaseId },
      select: { originalName: true, storagePath: true },
    });
    const images = new Map<string, string>();
    for (const candidate of candidates) {
      const extension = this.extensionOf(candidate.originalName);
      if (this.imageExtensions.has(extension)) {
        images.set(
          candidate.originalName.toLocaleLowerCase(),
          candidate.storagePath,
        );
      }
    }

    await this.visitImages(parsed, async (node) => {
      const src = node.attrs.src;
      if (typeof src !== 'string' || /^(?:[a-z]+:|\/\/)/iu.test(src)) return;

      let fileName: string;
      try {
        fileName = basename(
          decodeURIComponent(src.split(/[?#]/u, 1)[0] ?? src),
        );
      } catch {
        fileName = basename(src.split(/[?#]/u, 1)[0] ?? src);
      }
      const storagePath = images.get(fileName.toLocaleLowerCase());
      if (!storagePath) return;

      const image = await this.readImage(
        storagePath,
        this.extensionOf(fileName),
      );
      node.attrs.description = await this.imageUnderstanding.describe(
        image.buffer,
        image.mimeType,
      );
    });
  }

  private async visitImages(
    node: ParsedNode,
    visit: (node: ParsedNode) => Promise<void>,
  ): Promise<void> {
    if (node.type === 'image') await visit(node);
    for (const child of node.children) await this.visitImages(child, visit);
  }

  private async readImage(storagePath: string, extension: string) {
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    };
    const mimeType = mimeTypes[extension];
    if (!mimeType)
      throw new BadRequestException('图片格式只支持 PNG、JPG、JPEG 和 WebP');

    try {
      return { buffer: await this.storage.read(storagePath), mimeType };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new BadRequestException('图片文件不存在，请重新上传');
      }
      throw error;
    }
  }

  private extensionOf(fileName: string): string {
    return extname(fileName).slice(1).toLowerCase();
  }
}
