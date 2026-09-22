import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import type { DocumentEntity } from '../entities/document.entity.js';
import { LocalStorageService } from '../local-storage.service.js';
import { MarkdownParser } from './md.js';
import type { DocumentParser } from './shared/document-parser.js';
import type { ParsedDocument } from './shared/parsed-tree.js';

/** 解析器入口：按文件扩展名选择具体解析器。 */
@Injectable()
export class DocumentParseService {
  private readonly markdownParser = new MarkdownParser();

  private readonly parsers = new Map<string, DocumentParser>([
    ['md', this.markdownParser],
    ['markdown', this.markdownParser],
  ]);

  constructor(private readonly storage: LocalStorageService) {}

  canParse(fileName: string): boolean {
    return this.parsers.has(this.extensionOf(fileName));
  }

  async parse(document: DocumentEntity): Promise<ParsedDocument> {
    const parser = this.parsers.get(this.extensionOf(document.originalName));
    if (!parser) throw new BadRequestException('当前只支持解析 Markdown 文件');

    let source: Buffer;
    try {
      source = await this.storage.read(document.storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new BadRequestException('本地文件不存在，请重新上传');
      }
      throw error;
    }
    return parser.parse(source.toString('utf8'));
  }

  private extensionOf(fileName: string): string {
    return extname(fileName).slice(1).toLowerCase();
  }
}
