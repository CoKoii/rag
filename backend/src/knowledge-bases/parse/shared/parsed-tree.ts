export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** 跨文件格式通用的文档节点。节点只表达文档语义，不暴露具体解析库的 AST。 */
export interface ParsedNode {
  type: string;
  attrs: Record<string, JsonValue>;
  text?: string;
  children: ParsedNode[];
}

/** 所有文件格式最终都转换成同一棵文档树。文件名等信息由文档实体保存。 */
export type ParsedDocument = ParsedNode;

export const createNode = (
  type: string,
  attrs: Record<string, JsonValue> = {},
  children: ParsedNode[] = [],
  text?: string,
): ParsedNode => ({
  type,
  attrs,
  ...(text === undefined ? {} : { text }),
  children,
});

export const createDocument = (children: ParsedNode[]): ParsedDocument => createNode('document', {}, children);
