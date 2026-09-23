import { computed, ref } from 'vue'
import { ragApi } from '../api'
import type {
  ChunkItem,
  DocumentItem,
  KnowledgeBase,
  ParsedDocument,
  ParseResult,
  WorkspaceView,
} from '../types'

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export function useRagWorkspace() {
  const view = ref<WorkspaceView>('documents')
  const knowledgeBases = ref<KnowledgeBase[]>([])
  const documentsByBase = ref<Record<string, DocumentItem[]>>({})
  const chunksByBase = ref<Record<string, ChunkItem[]>>({})
  const selectedBaseId = ref('')
  const selectedDocumentId = ref<string | null>(null)
  const loading = ref(true)
  const uploading = ref(false)
  const creatingBase = ref(false)
  const parsing = ref(false)
  const parseLoading = ref(false)
  const chunksLoading = ref(false)
  const retrievalLoading = ref(false)
  const createDialogOpen = ref(false)
  const parseDialogOpen = ref(false)
  const error = ref('')
  const createError = ref('')
  const parseError = ref('')
  const parseTarget = ref<DocumentItem | null>(null)
  const parsedData = ref<ParsedDocument | null>(null)
  const chunkSearch = ref('')

  const selectedBase = computed(() =>
    knowledgeBases.value.find(({ id }) => id === selectedBaseId.value),
  )
  const documents = computed(() => documentsByBase.value[selectedBaseId.value] ?? [])
  const chunks = computed(() => chunksByBase.value[selectedBaseId.value] ?? [])
  const selectedDocument = computed(() =>
    documents.value.find(({ id }) => id === selectedDocumentId.value),
  )
  const visibleChunks = computed(() =>
    chunks.value.filter(({ documentId }) => documentId === selectedDocumentId.value),
  )
  const filteredChunks = computed(() => {
    const keyword = chunkSearch.value.trim().toLocaleLowerCase()
    return keyword
      ? visibleChunks.value.filter(({ content }) => content.toLocaleLowerCase().includes(keyword))
      : visibleChunks.value
  })
  const chunkCount = computed(() =>
    documents.value.reduce((sum, document) => sum + document.chunkCount, 0),
  )
  const documentCounts = computed(() =>
    Object.fromEntries(
      knowledgeBases.value.map(({ id }) => [id, documentsByBase.value[id]?.length ?? 0]),
    ),
  )

  const loadDocuments = async (baseId: string) => {
    const result = await ragApi.listDocuments(baseId)
    documentsByBase.value[baseId] = result
    chunksByBase.value[baseId] = []
  }

  const load = async () => {
    loading.value = true
    error.value = ''
    try {
      knowledgeBases.value = await ragApi.listKnowledgeBases()
      selectedBaseId.value = knowledgeBases.value[0]?.id ?? ''
      if (selectedBaseId.value) await loadDocuments(selectedBaseId.value)
    } catch (cause) {
      error.value = errorMessage(cause, '加载知识库失败')
    } finally {
      loading.value = false
    }
  }

  const selectBase = async (id: string) => {
    selectedBaseId.value = id
    selectedDocumentId.value = null
    view.value = 'documents'
    error.value = ''
    loading.value = true
    try {
      await loadDocuments(id)
    } catch (cause) {
      error.value = errorMessage(cause, '加载文件列表失败')
    } finally {
      loading.value = false
    }
  }

  const createBase = async (name: string) => {
    const cleanName = name.trim()
    if (!cleanName || creatingBase.value) return false
    creatingBase.value = true
    createError.value = ''
    try {
      const base = await ragApi.createKnowledgeBase(cleanName)
      knowledgeBases.value.unshift(base)
      documentsByBase.value[base.id] = []
      chunksByBase.value[base.id] = []
      selectedBaseId.value = base.id
      selectedDocumentId.value = null
      createDialogOpen.value = false
      return true
    } catch (cause) {
      createError.value = errorMessage(cause, '创建知识库失败')
      return false
    } finally {
      creatingBase.value = false
    }
  }

  const uploadFiles = async (files: FileList | File[]) => {
    const baseId = selectedBaseId.value
    if (!baseId || uploading.value) return
    uploading.value = true
    error.value = ''
    try {
      for (const file of Array.from(files)) {
        const document = await ragApi.uploadDocument(baseId, file)
        documentsByBase.value[baseId] = [document, ...(documentsByBase.value[baseId] ?? [])]
      }
    } catch (cause) {
      error.value = errorMessage(cause, '文件上传失败')
    } finally {
      uploading.value = false
    }
  }

  const removeDocument = async (document: DocumentItem) => {
    const baseId = selectedBaseId.value
    if (!baseId || !window.confirm(`确定删除文件“${document.name}”吗？`)) return
    error.value = ''
    try {
      await ragApi.removeDocument(baseId, document.id)
      documentsByBase.value[baseId] = (documentsByBase.value[baseId] ?? []).filter(
        ({ id }) => id !== document.id,
      )
      chunksByBase.value[baseId] = (chunksByBase.value[baseId] ?? []).filter(
        ({ documentId }) => documentId !== document.id,
      )
      if (selectedDocumentId.value === document.id) selectedDocumentId.value = null
    } catch (cause) {
      error.value = errorMessage(cause, '删除文件失败')
    }
  }

  const openParse = async (document: DocumentItem) => {
    parseTarget.value = document
    parsedData.value = null
    parseError.value = ''
    parseDialogOpen.value = true
    parseLoading.value = true
    try {
      const result = await ragApi.parseDocument(selectedBaseId.value, document.id)
      syncParseResult(document, result)
    } catch (cause) {
      parseError.value = errorMessage(cause, '读取解析结果失败')
    } finally {
      parseLoading.value = false
    }
  }

  const runParse = async () => {
    const baseId = selectedBaseId.value
    const document = parseTarget.value
    if (!baseId || !document || parsing.value) return
    parsing.value = true
    parseError.value = ''
    try {
      syncParseResult(document, await ragApi.runParser(baseId, document.id))
      document.chunkCount = 0
      chunksByBase.value[baseId] = (chunksByBase.value[baseId] ?? []).filter(
        ({ documentId }) => documentId !== document.id,
      )
    } catch (cause) {
      parseError.value = errorMessage(cause, '文档解析失败')
    } finally {
      parsing.value = false
    }
  }

  const syncParseResult = (document: DocumentItem, result: ParseResult) => {
    parsedData.value = result.parsedData
    document.status = result.status
    document.parsed = result.parsedData !== null
  }

  const closeParse = () => {
    if (parsing.value) return
    parseDialogOpen.value = false
    parseTarget.value = null
    parsedData.value = null
    parseError.value = ''
  }

  const openChunks = async (document: DocumentItem) => {
    const baseId = selectedBaseId.value
    selectedDocumentId.value = document.id
    chunkSearch.value = ''
    view.value = 'chunks'
    error.value = ''
    chunksLoading.value = true
    try {
      const result = await ragApi.listChunks(baseId, document.id)
      chunksByBase.value[baseId] = [
        ...(chunksByBase.value[baseId] ?? []).filter(
          ({ documentId }) => documentId !== document.id,
        ),
        ...result,
      ]
    } catch (cause) {
      error.value = errorMessage(cause, '加载切片失败')
    } finally {
      chunksLoading.value = false
    }
  }

  const runChunking = async (document: DocumentItem) => {
    const baseId = selectedBaseId.value
    if (!baseId) return
    if (
      document.chunkCount &&
      !window.confirm(
        `确定重新切片“${document.name}”吗？现有 ${document.chunkCount} 个切片将被覆盖。`,
      )
    )
      return
    error.value = ''
    try {
      const result = await ragApi.createChunks(baseId, document.id)
      document.chunkCount = result.length
      chunksByBase.value[baseId] = [
        ...(chunksByBase.value[baseId] ?? []).filter(
          ({ documentId }) => documentId !== document.id,
        ),
        ...result,
      ]
      selectedDocumentId.value = document.id
      view.value = 'chunks'
    } catch (cause) {
      error.value = errorMessage(cause, '切片失败，请先解析文档')
    }
  }

  const openRetrieval = async () => {
    const baseId = selectedBaseId.value
    view.value = 'retrieval'
    error.value = ''
    if (!baseId) return
    retrievalLoading.value = true
    try {
      const results = await Promise.all(
        (documentsByBase.value[baseId] ?? []).map(({ id }) => ragApi.listChunks(baseId, id)),
      )
      chunksByBase.value[baseId] = results.flat()
    } catch (cause) {
      error.value = errorMessage(cause, '加载召回测试数据失败')
    } finally {
      retrievalLoading.value = false
    }
  }

  const backToDocuments = () => {
    selectedDocumentId.value = null
    view.value = 'documents'
  }

  return {
    backToDocuments,
    chunkCount,
    chunks,
    chunksLoading,
    chunkSearch,
    closeParse,
    createBase,
    createDialogOpen,
    createError,
    creatingBase,
    documents,
    documentCounts,
    error,
    filteredChunks,
    knowledgeBases,
    load,
    loading,
    openChunks,
    openParse,
    parseDialogOpen,
    parseError,
    parseLoading,
    parseTarget,
    parsedData,
    parsing,
    removeDocument,
    openRetrieval,
    retrievalLoading,
    runChunking,
    runParse,
    selectBase,
    selectedBase,
    selectedBaseId,
    selectedDocument,
    uploadFiles,
    uploading,
    view,
  }
}
