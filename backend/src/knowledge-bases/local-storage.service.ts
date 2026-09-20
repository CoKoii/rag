import { Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

@Injectable()
export class LocalStorageService {
  private readonly root = resolve(process.env.UPLOAD_DIR ?? 'storage/uploads');

  async save(knowledgeBaseId: string, documentId: string, originalName: string, buffer: Buffer) {
    const safeName = basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedName = `${documentId}-${safeName}`;
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
}
