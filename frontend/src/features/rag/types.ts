export type WorkspaceView = 'documents' | 'retrieval' | 'chunks'
export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed'

export interface KnowledgeBase {
  id: string
  name: string
}

export interface DocumentItem {
  id: string
  name: string
  status: DocumentStatus
  parsed: boolean
  chunkCount: number
}

export interface ChunkItem {
  id: string
  documentId: string
  documentName: string
  index: number
  content: string
  sectionPaths: string[][]
  tokenCount: number
}

export interface ParsedNode {
  type: string
  attrs: Record<string, unknown>
  text?: string
  children: ParsedNode[]
}

export type ParsedDocument = ParsedNode

export interface ParseResult {
  id: string
  name: string
  status: DocumentStatus
  parsedData: ParsedDocument | null
}

export type DocumentResponse = DocumentItem
