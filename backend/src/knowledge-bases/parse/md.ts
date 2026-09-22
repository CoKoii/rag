import { unified } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import type { DocumentParser } from './shared/document-parser.js';
import {
  createDocument,
  createNode,
  type ParsedDocument,
  type ParsedNode,
} from './shared/parsed-tree.js';

interface MarkdownNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  start?: number;
  url?: string;
  alt?: string;
  lang?: string | null;
  children?: MarkdownNode[];
}

/** 将 Markdown AST 映射为跨格式通用的语义节点。 */
export class MarkdownParser implements DocumentParser {
  readonly format = 'markdown';

  private readonly processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml', 'toml']);

  parse(source: string): ParsedDocument {
    const ast = this.processor.parse(source) as unknown as MarkdownNode;
    return createDocument(this.toBlocks(ast.children ?? []));
  }

  private toBlocks(nodes: MarkdownNode[]): ParsedNode[] {
    return nodes.flatMap((node) => {
      switch (node.type) {
        case 'yaml':
        case 'toml':
          return [];
        case 'heading':
          return [createNode('heading', { level: node.depth ?? 1 }, this.toInlines(node.children ?? []))];
        case 'paragraph':
          return [createNode('paragraph', {}, this.toInlines(node.children ?? []))];
        case 'blockquote':
          return [createNode('quote', {}, this.toBlocks(node.children ?? []))];
        case 'list':
          return [createNode('list', {
            ordered: node.ordered ?? false,
            start: node.ordered ? (node.start ?? 1) : null,
          }, this.toBlocks(node.children ?? []))];
        case 'listItem':
          return [createNode('list-item', {}, this.toBlocks(node.children ?? []))];
        case 'code':
          return [createNode('code-block', { language: node.lang ?? null }, [], node.value ?? '')];
        case 'thematicBreak':
          return [createNode('thematic-break')];
        case 'table':
          return [createNode('table', {}, (node.children ?? []).map((row, index) => (
            createNode('table-row', { header: index === 0 }, this.toBlocks(row.children ?? []))
          )))];
        case 'tableRow':
          return [createNode('table-row', {}, this.toBlocks(node.children ?? []))];
        case 'tableCell':
          return [createNode('table-cell', {}, this.toInlines(node.children ?? []))];
        case 'html':
          return this.textBlock(this.stripHtml(node.value ?? ''));
        default:
          return this.toInlines([node]);
      }
    });
  }

  private toInlines(nodes: MarkdownNode[]): ParsedNode[] {
    return nodes.flatMap((node) => {
      switch (node.type) {
        case 'text':
          return [createNode('text', {}, [], node.value ?? '')];
        case 'emphasis':
          return [createNode('emphasis', {}, this.toInlines(node.children ?? []))];
        case 'strong':
          return [createNode('strong', {}, this.toInlines(node.children ?? []))];
        case 'delete':
          return [createNode('deletion', {}, this.toInlines(node.children ?? []))];
        case 'inlineCode':
          return [createNode('inline-code', {}, [], node.value ?? '')];
        case 'link':
          return [createNode('link', { href: node.url ?? '' }, this.toInlines(node.children ?? []))];
        case 'image':
          return [createNode('image', { src: node.url ?? '', alt: node.alt ?? '' })];
        case 'break':
          return [createNode('line-break')];
        case 'html':
          return this.toInlines([{ type: 'text', value: this.stripHtml(node.value ?? '') }]);
        case 'inlineMath':
          return [createNode('math', { display: false }, [], node.value ?? '')];
        default:
          return node.value === undefined ? [] : [createNode('text', {}, [], node.value)];
      }
    });
  }

  private textBlock(value: string): ParsedNode[] {
    const text = value.trim();
    return text ? [createNode('paragraph', {}, [], text)] : [];
  }

  private stripHtml(value: string): string {
    return value.replace(/<!--[\s\S]*?-->/gu, '').replace(/<[^>]*>/gu, '');
  }
}
