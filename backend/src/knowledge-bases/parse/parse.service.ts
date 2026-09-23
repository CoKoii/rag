import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { basename, extname } from 'node:path';
import { Repository } from 'typeorm';
import { DocumentEntity } from '../entities/document.entity.js';
import { LocalStorageService } from '../local-storage.service.js';
import { MarkdownParser } from './md.js';
import { QwenImageUnderstandingService } from './qwen-image-understanding.service.js';
import type { DocumentParser } from './shared/document-parser.js';
import type { ParsedDocument, ParsedNode } from './shared/parsed-tree.js';

interface ImageTask {
  nodes: ParsedNode[];
  label: string;
  describe: () => Promise<string>;
}

const imageConcurrency = 3;

/** 解析器入口：按文件扩展名选择具体解析器。 */
@Injectable()
export class DocumentParseService {
  private readonly logger = new Logger(DocumentParseService.name);
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
    const nodes = [...this.imagesIn(parsed)];
    const localNames = new Set(
      nodes.flatMap((node) => {
        const src = node.attrs.src;
        return typeof src === 'string' && !/^(?:[a-z]+:|\/\/)/iu.test(src)
          ? [this.fileNameFromSource(src).toLocaleLowerCase()]
          : [];
      }),
    );
    const images = new Map<string, string>();

    if (localNames.size) {
      const candidates = await this.documents.find({
        where: { knowledgeBaseId },
        select: { originalName: true, storagePath: true },
      });
      for (const candidate of candidates) {
        const name = candidate.originalName.toLocaleLowerCase();
        if (
          localNames.has(name) &&
          this.imageExtensions.has(this.extensionOf(name))
        ) {
          images.set(name, candidate.storagePath);
        }
      }
    }

    const tasks = new Map<string, ImageTask>();

    for (const node of nodes) {
      const src = node.attrs.src;
      if (typeof src !== 'string') continue;
      if (/^https:\/\//iu.test(src)) {
        const url = new URL(src);
        const key = `url:${url.href}`;
        const task = tasks.get(key) ?? {
          nodes: [],
          label: `${url.host}${url.pathname}`,
          describe: () => this.imageUnderstanding.describeUrl(url.href),
        };
        task.nodes.push(node);
        tasks.set(key, task);
        continue;
      }
      if (/^(?:[a-z]+:|\/\/)/iu.test(src)) continue;

      const fileName = this.fileNameFromSource(src);
      const storagePath = images.get(fileName.toLocaleLowerCase());
      if (!storagePath) continue;

      const task = tasks.get(storagePath) ?? {
        nodes: [],
        label: fileName,
        describe: async () => {
          const image = await this.readImage(
            storagePath,
            this.extensionOf(fileName),
          );
          return this.imageUnderstanding.describe(image.buffer, image.mimeType);
        },
      };
      task.nodes.push(node);
      tasks.set(storagePath, task);
    }

    const uniqueTasks = [...tasks.values()];
    for (let index = 0; index < uniqueTasks.length; index += imageConcurrency) {
      await Promise.all(
        uniqueTasks.slice(index, index + imageConcurrency).map(async (task) => {
          const startedAt = Date.now();
          try {
            const description = await task.describe();
            for (const node of task.nodes) node.attrs.description = description;
            this.logger.log(
              `图片解析完成：${task.label}，${Date.now() - startedAt}ms`,
            );
          } catch (error) {
            this.logger.warn(
              `图片解析失败：${task.label}，${Date.now() - startedAt}ms`,
            );
            throw error;
          }
        }),
      );
    }
  }

  private *imagesIn(node: ParsedNode): IterableIterator<ParsedNode> {
    if (node.type === 'image') yield node;
    for (const child of node.children) yield* this.imagesIn(child);
  }

  private fileNameFromSource(src: string): string {
    const path = src.split(/[?#]/u, 1)[0] ?? src;
    try {
      return basename(decodeURIComponent(path));
    } catch {
      return basename(path);
    }
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
