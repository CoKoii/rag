import { Injectable } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

@Injectable()
export class LocalStorageService {
  private readonly root = resolve(process.env.UPLOAD_DIR ?? 'storage/uploads');

  async save(knowledgeBaseId: string, documentId: string, originalName: string, buffer: Buffer) {
    const storedName = `${documentId}${extname(originalName).toLowerCase()}`;
    const directory = join(this.root, knowledgeBaseId);
    const absolutePath = join(directory, storedName);

    await mkdir(directory, { recursive: true });
    await writeFile(absolutePath, buffer);

    return {
      storagePath: relative(this.root, absolutePath),
    };
  }

  async remove(storagePath: string): Promise<void> {
    const absolutePath = resolve(this.root, storagePath);
    if (!absolutePath.startsWith(`${this.root}/`)) return;

    try {
      await unlink(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async read(storagePath: string): Promise<Buffer> {
    const absolutePath = resolve(this.root, storagePath);
    if (!absolutePath.startsWith(`${this.root}/`)) throw new Error('非法文件路径');
    return readFile(absolutePath);
  }
}
