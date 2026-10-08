import type {
  ChunkItem,
  DocumentResponse,
  KnowledgeBase,
  ParseResult,
  RetrievalResult,
} from './types'

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options)
  const text = await response.text()
  let body: unknown

  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: string }).message
        : undefined
    throw new Error(message ?? `请求失败（${response.status}）`)
  }

  return body as T
}

const knowledgeBasePath = (knowledgeBaseId: string) =>
  `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}`

const documentPath = (knowledgeBaseId: string, documentId = '') =>
  `${knowledgeBasePath(knowledgeBaseId)}/documents${documentId ? `/${encodeURIComponent(documentId)}` : ''}`

export const ragApi = {
  listKnowledgeBases: () => request<KnowledgeBase[]>('/api/knowledge-bases'),

  createKnowledgeBase: (name: string) =>
    request<KnowledgeBase>('/api/knowledge-bases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  listDocuments: (knowledgeBaseId: string) =>
    request<DocumentResponse[]>(documentPath(knowledgeBaseId)),

  uploadDocument: (knowledgeBaseId: string, file: File) => {
    const data = new FormData()
    data.append('file', file)
    return request<DocumentResponse>(documentPath(knowledgeBaseId), { method: 'POST', body: data })
  },

  removeDocument: (knowledgeBaseId: string, documentId: string) =>
    request<void>(documentPath(knowledgeBaseId, documentId), { method: 'DELETE' }),

  parseDocument: (knowledgeBaseId: string, documentId: string) =>
    request<ParseResult>(`${documentPath(knowledgeBaseId, documentId)}/parse`),

  runParser: (knowledgeBaseId: string, documentId: string) =>
    request<ParseResult>(`${documentPath(knowledgeBaseId, documentId)}/parse`, { method: 'POST' }),

  listChunks: (knowledgeBaseId: string, documentId: string) =>
    request<ChunkItem[]>(`${documentPath(knowledgeBaseId, documentId)}/chunks`),

  createChunks: (knowledgeBaseId: string, documentId: string) =>
    request<ChunkItem[]>(`${documentPath(knowledgeBaseId, documentId)}/chunks`, { method: 'POST' }),

  embedDocument: (knowledgeBaseId: string, documentId: string) =>
    request<{ count: number }>(`${documentPath(knowledgeBaseId, documentId)}/embedding`, {
      method: 'POST',
    }),

  retrieve: (knowledgeBaseId: string, query: string, topK: number) =>
    request<RetrievalResult[]>(`${knowledgeBasePath(knowledgeBaseId)}/retrieval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, topK }),
    }),

  originalFileUrl: (knowledgeBaseId: string, documentId: string) =>
    `${documentPath(knowledgeBaseId, documentId)}/file`,
}
