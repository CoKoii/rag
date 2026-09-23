import { Injectable } from '@nestjs/common';
import { decode, encode } from 'gpt-tokenizer';
import type { ParsedDocument, ParsedNode } from '../parse/shared/parsed-tree.js';

export interface ChunkDraft {
  content: string;
  sectionPaths: string[][];
  tokenCount: number;
}

interface ChunkUnit {
  content: string;
  sectionPath: string[];
  mergeKey: string;
  mergeable: boolean;
}

interface WorkingChunk {
  content: string;
  sectionPaths: string[][];
  lastSectionPath: string[];
  mergeKey: string;
  mergeable: boolean;
}

/** 将统一文档树转换成适合检索的语义切片。 */
@Injectable()
export class ChunkingService {
  readonly maxTokens = 500;
  readonly overlapTokens = 50;
  readonly maxSectionPaths = 2;

  create(document: ParsedDocument): ChunkDraft[] {
    const units = this.collectUnits(document.children);
    const chunks: ChunkDraft[] = [];
    let current: WorkingChunk | null = null;

    for (const unit of units) {
      if (!current) {
        current = this.startChunk(unit);
        continue;
      }

      if (!this.canMerge(current, unit)) {
        chunks.push(this.toDraft(current));
        current = this.startChunk(unit);
        continue;
      }

      const content = this.withSectionContext(unit.content, unit.sectionPath, current.lastSectionPath);
      const merged = `${current.content}\n\n${content}`;
      if (this.tokenCount(merged) <= this.maxTokens) {
        current.content = merged;
        current.sectionPaths = this.addPath(current.sectionPaths, unit.sectionPath);
        current.lastSectionPath = unit.sectionPath;
        continue;
      }

      chunks.push(this.toDraft(current));
      current = this.startChunk(unit);
    }

    if (current) chunks.push(this.toDraft(current));
    return chunks;
  }

  private collectUnits(nodes: ParsedNode[]): ChunkUnit[] {
    const units: ChunkUnit[] = [];
    let sectionPath: string[] = [];

    for (const node of nodes) {
      if (node.type === 'heading') {
        const level = this.numberAttr(node.attrs.level, 1);
        const title = this.renderText(node).trim();
        if (title) sectionPath = [...sectionPath.slice(0, level - 1), title];
        continue;
      }

      const contents = node.type === 'table'
        ? this.renderTableRows(node)
        : [this.renderText(node).trim()];

      for (const content of contents.filter(Boolean)) {
        const unit = {
          content,
          sectionPath: [...sectionPath],
          mergeKey: this.mergeKey(sectionPath),
          mergeable: true,
        };
        units.push(...this.splitUnit(unit));
      }
    }

    return units;
  }

  private splitUnit(unit: ChunkUnit): ChunkUnit[] {
    const contentLimit = Math.max(1, this.maxTokens - this.tokenCount(this.sectionContext(unit.sectionPath)));
    if (this.tokenCount(unit.content) <= contentLimit) return [unit];

    const sentences = unit.content
      .split(/(?<=[。！？!?；;.!?])\s*|\n+/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const parts: ChunkUnit[] = [];
    let current = '';

    for (const sentence of sentences.length ? sentences : [unit.content]) {
      if (this.tokenCount(sentence) > contentLimit) {
        const overlap = this.overlapText(current);
        if (current) parts.push(this.unsplittable(unit, current));
        current = '';
        parts.push(...this.splitTokens(unit, overlap ? `${overlap} ${sentence}` : sentence, contentLimit));
        continue;
      }

      const candidate = current ? `${current} ${sentence}` : sentence;
      if (this.tokenCount(candidate) <= contentLimit) {
        current = candidate;
        continue;
      }

      if (current) parts.push(this.unsplittable(unit, current));
      const overlap = this.overlapText(current);
      current = this.tokenCount(`${overlap} ${sentence}`) <= contentLimit
        ? `${overlap} ${sentence}`
        : sentence;
    }

    if (current) parts.push(this.unsplittable(unit, current));
    return parts;
  }

  private splitTokens(unit: ChunkUnit, content: string, contentLimit: number): ChunkUnit[] {
    const tokens = encode(content);
    const step = Math.max(1, contentLimit - this.overlapTokens);
    const parts: ChunkUnit[] = [];

    for (let start = 0; start < tokens.length; start += step) {
      const end = Math.min(start + contentLimit, tokens.length);
      parts.push(this.unsplittable(unit, decode(tokens.slice(start, end))));
      if (end === tokens.length) break;
    }
    return parts;
  }

  private renderText(node: ParsedNode): string {
    if (node.type === 'code-block' && node.text !== undefined) return node.text;
    if (node.type === 'image') {
      const description = typeof node.attrs.description === 'string' ? node.attrs.description : '';
      const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
      return [description, alt].filter(Boolean).join('\n');
    }
    if (node.type === 'list') return this.renderList(node);
    if (node.type === 'list-item') return node.children.map((child) => this.renderText(child)).join('\n');
    if (node.type === 'line-break') return '\n';
    if (node.type === 'thematic-break') return '';
    if (node.type === 'table-row') return node.children.map((child) => this.renderText(child)).join(' | ');
    if (node.type === 'table-cell') return node.children.map((child) => this.renderText(child)).join('');
    if (node.text !== undefined) return node.text;
    return node.children.map((child) => this.renderText(child)).join('');
  }

  private renderList(node: ParsedNode): string {
    const ordered = node.attrs.ordered === true;
    const start = this.numberAttr(node.attrs.start, 1);
    return node.children.map((child, index) => {
      const marker = ordered ? `${start + index}.` : '-';
      return `${marker} ${this.renderText(child).trim()}`;
    }).join('\n');
  }

  private renderTableRows(node: ParsedNode): string[] {
    const rows = node.children.filter((child) => child.type === 'table-row');
    if (!rows.length) return [];

    const header = rows.find((row) => row.attrs.header === true) ?? rows[0];
    const headers = header.children.map((cell) => this.renderText(cell).trim());
    const dataRows = rows.filter((row) => row !== header);
    const rowsToRender = dataRows.length ? dataRows : [header];

    return rowsToRender.map((row) => {
      const fields = row.children.map((cell, index) => {
        const label = headers[index] || `第${index + 1}列`;
        return `${label}：${this.renderText(cell).trim()}`;
      });
      return ['表格：', ...fields].join('\n');
    });
  }

  private canMerge(chunk: WorkingChunk, unit: ChunkUnit): boolean {
    if (!chunk.mergeable || !unit.mergeable || chunk.mergeKey !== unit.mergeKey) return false;
    return this.samePath(chunk.lastSectionPath, unit.sectionPath)
      || chunk.sectionPaths.length < this.maxSectionPaths;
  }

  private startChunk(unit: ChunkUnit): WorkingChunk {
    return {
      content: this.withSectionContext(unit.content, unit.sectionPath),
      sectionPaths: [unit.sectionPath],
      lastSectionPath: unit.sectionPath,
      mergeKey: unit.mergeKey,
      mergeable: unit.mergeable,
    };
  }

  private unsplittable(unit: ChunkUnit, content: string): ChunkUnit {
    return { ...unit, content, mergeable: false };
  }

  private toDraft(chunk: WorkingChunk): ChunkDraft {
    return {
      content: chunk.content,
      sectionPaths: chunk.sectionPaths,
      tokenCount: this.tokenCount(chunk.content),
    };
  }

  private withSectionContext(content: string, sectionPath: string[], previousPath?: string[]): string {
    if (previousPath && this.samePath(previousPath, sectionPath)) return content;
    const context = this.sectionContext(sectionPath);
    return context ? `${context}${content}` : content;
  }

  private sectionContext(sectionPath: string[]): string {
    return sectionPath.length ? `章节：${sectionPath.join(' → ')}\n` : '';
  }

  private mergeKey(sectionPath: string[]): string {
    return sectionPath.slice(0, -1).join('\u0000');
  }

  private addPath(paths: string[][], path: string[]): string[][] {
    return paths.some((item) => this.samePath(item, path)) ? paths : [...paths, path];
  }

  private samePath(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private overlapText(content: string): string {
    const tokens = encode(content);
    return decode(tokens.slice(Math.max(0, tokens.length - this.overlapTokens)));
  }

  private tokenCount(content: string): number {
    return encode(content).length;
  }

  private numberAttr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
  }
}
