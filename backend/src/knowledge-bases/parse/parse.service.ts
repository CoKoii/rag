import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import { DocumentEntity } from '../entities/document.entity.js';
import { LocalStorageService } from '../local-storage.service.js';
import { MarkdownParser } from './md.js';
import type { DocumentParser } from './shared/document-parser.js';
import type { ParsedDocument } from './shared/parsed-tree.js';

const imageMimeTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** 按文件扩展名解析文档，图片保留为原始媒体节点。 */
@Injectable()
export class DocumentParseService {
  private readonly markdownParser = new MarkdownParser();
  private readonly parsers = new Map<string, DocumentParser>([
    ['md', this.markdownParser],
    ['markdown', this.markdownParser],
  ]);

  constructor(private readonly storage: LocalStorageService) {}

  canParse(fileName: string): boolean {
    const extension = this.extensionOf(fileName);
    return this.parsers.has(extension) || extension in imageMimeTypes;
  }

  async parse(document: DocumentEntity): Promise<ParsedDocument> {
    const extension = this.extensionOf(document.originalName);
    const mimeType = imageMimeTypes[extension];
    if (mimeType) {
      return {
        type: 'document',
        attrs: {},
        children: [
          {
            type: 'image',
            attrs: {
              src: document.originalName,
              storagePath: document.storagePath,
              mimeType,
            },
            children: [],
          },
        ],
      };
    }

    const parser = this.parsers.get(extension);
    if (!parser)
      throw new BadRequestException('当前只支持解析 Markdown 和图片文件');

    try {
      const source = await this.storage.read(document.storagePath);
      return parser.parse(source.toString('utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new BadRequestException('本地文件不存在，请重新上传');
      }
      throw error;
    }
  }

  private extensionOf(fileName: string): string {
    return extname(fileName).slice(1).toLowerCase();
  }
}
