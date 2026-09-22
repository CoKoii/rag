import type { ParsedDocument } from './parsed-tree.js';

/** 一个文件格式解析器必须实现的最小接口。 */
export interface DocumentParser {
  readonly format: string;
  parse(source: string): ParsedDocument;
}
