import { BadRequestException, Injectable } from '@nestjs/common';
import { extname } from 'node:path';
import { LocalStorageService } from '../local-storage.service.js';
import { MarkdownParser } from './md.js';
import type { ParsedDocument } from './shared/parsed-tree.js';

@Injectable()
export class DocumentParseService {
  private readonly parser = new MarkdownParser();

  constructor(private readonly storage: LocalStorageService) {}

  canParse(fileName: string): boolean {
    return ['.md', '.markdown'].includes(extname(fileName).toLowerCase());
  }

  async parse(storagePath: string): Promise<ParsedDocument> {
    try {
      const source = await this.storage.read(storagePath);
      return this.parser.parse(source.toString('utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new BadRequestException('本地文件不存在，请重新上传');
      }
      throw error;
    }
  }
}
