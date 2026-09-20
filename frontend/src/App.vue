<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type ViewName = 'documents' | 'retrieval' | 'chunks'
type DocumentStatus = 'uploaded' | 'error'

interface Library { id: string; name: string }
interface DocumentItem {
  id: string
  name: string
  status: DocumentStatus
}
interface ChunkItem {
  id: string
  documentId: string
  documentName: string
  index: number
  page: number | null
  content: string
  tokens: number
}
interface RetrievalResult extends ChunkItem { score: number }

const activeView = ref<ViewName>('documents')
const selectedLibraryId = ref('')
const selectedDocumentId = ref<string | null>(null)
const showCreateLibrary = ref(false)
const newLibraryName = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const chunkSearch = ref('')
const retrievalQuery = ref('如何配置数据库连接？')
const retrievalTopK = ref(5)
const retrievalHasRun = ref(false)
const retrievalResults = ref<RetrievalResult[]>([])
const isLoading = ref(true)
const isUploading = ref(false)
const errorMessage = ref('')
const createError = ref('')

const libraries = ref<Library[]>([])
const documentsByLibrary = ref<Record<string, DocumentItem[]>>({})
const chunksByLibrary = ref<Record<string, ChunkItem[]>>({})

const selectedLibrary = computed(() => libraries.value.find((item) => item.id === selectedLibraryId.value))
const currentDocuments = computed(() => documentsByLibrary.value[selectedLibraryId.value] ?? [])
const currentChunks = computed(() => chunksByLibrary.value[selectedLibraryId.value] ?? [])
const selectedDocument = computed(() => currentDocuments.value.find((document) => document.id === selectedDocumentId.value))
const visibleChunks = computed(() => selectedDocumentId.value ? currentChunks.value.filter((chunk) => chunk.documentId === selectedDocumentId.value) : [])
const filteredChunks = computed(() => {
  const keyword = chunkSearch.value.trim().toLowerCase()
  if (!keyword) return visibleChunks.value
  return visibleChunks.value.filter((chunk) => chunk.content.toLowerCase().includes(keyword) || chunk.documentName.toLowerCase().includes(keyword))
})

const libraryStats = (id: string) => {
  const documents = documentsByLibrary.value[id] ?? []
  const chunks = chunksByLibrary.value[id] ?? []
  return { documents: documents.length, chunks: chunks.length }
}

const statusText: Record<DocumentStatus, string> = { uploaded: '已上传', error: '上传失败' }

const requestJson = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options)
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message ?? `请求失败（${response.status}）`)
  }
  return response.json() as Promise<T>
}

const normalizeDocument = (document: { id: string; name: string; status: string }): DocumentItem => ({
  ...document,
  status: document.status === 'error' ? 'error' : 'uploaded',
})

const loadDocuments = async (libraryId: string) => {
  const documents = await requestJson<Array<{ id: string; name: string; status: string }>>(`/api/knowledge-bases/${libraryId}/documents`)
  documentsByLibrary.value[libraryId] = documents.map(normalizeDocument)
  chunksByLibrary.value[libraryId] = []
}

const loadLibraries = async () => {
  isLoading.value = true
  errorMessage.value = ''
  try {
    libraries.value = await requestJson<Library[]>('/api/knowledge-bases')
    const firstLibrary = libraries.value[0]
    if (firstLibrary) {
      selectedLibraryId.value = firstLibrary.id
      await loadDocuments(firstLibrary.id)
    } else {
      selectedLibraryId.value = ''
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载知识库失败'
  } finally {
    isLoading.value = false
  }
}

onMounted(loadLibraries)

const selectLibrary = async (id: string) => {
  selectedLibraryId.value = id
  selectedDocumentId.value = null
  activeView.value = 'documents'
  retrievalHasRun.value = false
  retrievalResults.value = []
  try {
    await loadDocuments(id)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载文件列表失败'
  }
}

const createLibrary = async () => {
  const name = newLibraryName.value.trim()
  if (!name) return
  createError.value = ''
  try {
    const library = await requestJson<Library>('/api/knowledge-bases', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    libraries.value.unshift(library)
    documentsByLibrary.value[library.id] = []
    chunksByLibrary.value[library.id] = []
    selectedLibraryId.value = library.id
    selectedDocumentId.value = null
    newLibraryName.value = ''
    showCreateLibrary.value = false
  } catch (error) {
    createError.value = error instanceof Error ? error.message : '创建知识库失败'
  }
}

const openFilePicker = () => {
  if (selectedLibraryId.value) fileInput.value?.click()
}

const addFiles = async (fileList: FileList | File[]) => {
  if (!selectedLibraryId.value) return
  isUploading.value = true
  errorMessage.value = ''
  try {
    const documents = documentsByLibrary.value[selectedLibraryId.value] ?? []
    for (const file of Array.from(fileList)) {
      const formData = new FormData()
      formData.append('file', file)
      const document = await requestJson<{ id: string; name: string; status: string }>(`/api/knowledge-bases/${selectedLibraryId.value}/documents`, {
        method: 'POST',
        body: formData,
      })
      documents.unshift(normalizeDocument(document))
    }
    documentsByLibrary.value[selectedLibraryId.value] = documents
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文件上传失败'
  } finally {
    isUploading.value = false
  }
}

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files?.length) addFiles(input.files)
  input.value = ''
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer?.files.length) addFiles(event.dataTransfer.files)
}

const removeDocument = async (id: string) => {
  if (!selectedLibraryId.value) return
  try {
    await requestJson(`/api/knowledge-bases/${selectedLibraryId.value}/documents/${id}`, { method: 'DELETE' })
    documentsByLibrary.value[selectedLibraryId.value] = currentDocuments.value.filter((document) => document.id !== id)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '删除文件失败'
  }
  if (selectedDocumentId.value === id) selectedDocumentId.value = null
}

const openDocumentChunks = (document: DocumentItem) => {
  selectedDocumentId.value = document.id
  chunkSearch.value = ''
  activeView.value = 'chunks'
}

const backToDocuments = () => {
  selectedDocumentId.value = null
  activeView.value = 'documents'
}

const runRetrieval = () => {
  if (!retrievalQuery.value.trim()) return
  retrievalResults.value = currentChunks.value.slice(0, retrievalTopK.value).map((chunk, index) => ({ ...chunk, score: Number((0.94 - index * 0.07).toFixed(2)) }))
  retrievalHasRun.value = true
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">R</div><div><strong>RAG Lab</strong><span>Knowledge workspace</span></div></div>
      <div class="sidebar-heading"><span>知识库</span><button class="icon-button" type="button" title="新增知识库" @click="showCreateLibrary = true">+</button></div>
      <nav v-if="libraries.length" class="library-list" aria-label="知识库列表">
        <button v-for="library in libraries" :key="library.id" class="library-item" :class="{ selected: library.id === selectedLibraryId }" type="button" @click="selectLibrary(library.id)">
          <span class="library-icon">{{ library.name.slice(0, 1) }}</span><span class="library-copy"><strong>{{ library.name }}</strong><small>{{ libraryStats(library.id).documents }} 个文件</small></span><span v-if="library.id === selectedLibraryId" class="selected-dot"></span>
        </button>
      </nav>
      <div v-else class="sidebar-empty">暂无知识库</div>
      <div class="sidebar-footer"><span class="online-dot"></span><span>本地 Demo 模式</span></div>
    </aside>

    <main class="main-content">
      <header class="page-header"><div><p class="eyebrow">KNOWLEDGE BASE</p><h1>{{ selectedLibrary?.name || '知识库工作台' }}</h1><p class="page-description">{{ selectedLibrary ? '当前知识库文件' : '先创建一个知识库，再上传文档。' }}</p></div><button class="primary-button" type="button" :disabled="!selectedLibraryId || isUploading" @click="openFilePicker">{{ isUploading ? '上传中…' : '+ 上传文件' }}</button></header>
      <section class="stats-grid"><div class="stat-item"><span>文件数</span><strong>{{ libraryStats(selectedLibraryId).documents }}</strong></div><div class="stat-item"><span>切片数</span><strong>{{ libraryStats(selectedLibraryId).chunks }}</strong></div><div class="stat-item"><span>索引状态</span><strong class="ready-text">正常</strong></div></section>
      <nav class="view-tabs" aria-label="工作区视图"><button class="view-tab" :class="{ active: activeView === 'documents' }" type="button" @click="backToDocuments">文件列表</button><button class="view-tab" :class="{ active: activeView === 'retrieval' }" type="button" @click="activeView = 'retrieval'">召回测试</button></nav>

      <section v-if="activeView === 'documents'" class="workspace-panel">
        <div class="panel-heading"><div><h2>文件列表</h2><p>上传文档后，文件会保存到本地并记录在数据库中。</p></div></div>
        <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
        <div v-if="isLoading" class="empty-state compact"><strong>正在加载知识库</strong><span>请稍候。</span></div>
        <button v-else class="upload-zone" type="button" :disabled="!selectedLibraryId || isUploading" @click="openFilePicker" @dragover.prevent @drop="handleDrop"><span class="upload-symbol">↑</span><span><strong>{{ selectedLibraryId ? '点击或拖拽文件到这里上传' : '请先创建知识库' }}</strong><small>支持 TXT、Markdown、PDF，单个文件最大 10 MB</small></span></button>
        <input ref="fileInput" class="hidden-input" type="file" accept=".txt,.md,.pdf" multiple @change="handleFileSelect" />
        <div v-if="!isLoading && currentDocuments.length" class="document-table-wrap"><table class="document-table"><thead><tr><th>文件名</th><th>切片</th><th>状态</th><th></th></tr></thead><tbody><tr v-for="document in currentDocuments" :key="document.id"><td><button class="file-link" type="button" @click="openDocumentChunks(document)"><strong>{{ document.name }}</strong></button></td><td class="muted-cell">-</td><td><span class="status-pill" :class="`status-${document.status}`">{{ statusText[document.status] }}</span></td><td><div class="row-actions"><button class="text-button danger" type="button" @click="removeDocument(document.id)">删除</button></div></td></tr></tbody></table></div>
        <div v-else-if="!isLoading" class="empty-state"><strong>还没有文件</strong><span>{{ selectedLibraryId ? '上传一份文档，开始建立这个知识库。' : '点击左侧加号创建知识库。' }}</span></div>
      </section>

      <section v-else-if="activeView === 'retrieval'" class="workspace-panel">
        <div class="panel-heading"><div><h2>召回测试</h2><p>输入问题，查看向量检索返回的相关文本片段。</p></div><span class="mode-label">Dense Retrieval · Demo</span></div>
        <form class="retrieval-form" @submit.prevent="runRetrieval"><label for="retrieval-query">测试问题</label><div class="retrieval-controls"><input id="retrieval-query" v-model="retrievalQuery" type="text" placeholder="输入你想检索的问题" /><select v-model="retrievalTopK" aria-label="返回数量"><option :value="3">Top 3</option><option :value="5">Top 5</option><option :value="8">Top 8</option></select><button class="primary-button" type="submit">开始召回</button></div></form>
        <div v-if="retrievalHasRun" class="retrieval-result-heading"><span>返回 {{ retrievalResults.length }} 个结果</span><span class="muted-cell">耗时 38 ms · 本地模拟</span></div>
        <div v-if="retrievalHasRun && retrievalResults.length" class="result-list"><article v-for="(result, index) in retrievalResults" :key="result.id" class="result-item"><div class="result-meta"><span class="rank-number">{{ index + 1 }}</span><strong>{{ result.documentName }}</strong><span v-if="result.page" class="muted-cell">第 {{ result.page }} 页</span><span class="score">相似度 {{ result.score }}</span></div><p>{{ result.content }}</p><small>Chunk {{ result.index }} · {{ result.tokens }} tokens</small></article></div>
        <div v-else-if="retrievalHasRun" class="empty-state compact"><strong>没有召回结果</strong><span>尝试换一种表达，或先上传并处理文档。</span></div><div v-else class="retrieval-placeholder"><span class="search-symbol">⌕</span><strong>输入问题开始测试</strong><span>这里会展示相似度、来源文档和文本片段。</span></div>
      </section>

      <section v-else class="workspace-panel">
        <div class="panel-heading"><div><button class="back-button" type="button" @click="backToDocuments">← 返回文件列表</button><h2>{{ selectedDocument?.name || '文件切片' }}</h2><p>查看当前文件已经建立的文本片段。</p></div><label class="search-field"><span>⌕</span><input v-model="chunkSearch" type="search" placeholder="搜索切片内容" /></label></div>
        <div v-if="filteredChunks.length" class="chunk-list"><article v-for="chunk in filteredChunks" :key="chunk.id" class="chunk-item"><div class="chunk-heading"><div><strong>{{ chunk.documentName }}</strong><span>Chunk {{ chunk.index }}<template v-if="chunk.page"> · 第 {{ chunk.page }} 页</template></span></div><span class="token-count">{{ chunk.tokens }} tokens</span></div><p>{{ chunk.content }}</p><small>{{ chunk.id }}</small></article></div><div v-else class="empty-state"><strong>没有匹配的切片</strong><span>调整搜索关键词，或先处理一份文档。</span></div>
      </section>
    </main>

    <div v-if="showCreateLibrary" class="modal-backdrop" @click.self="showCreateLibrary = false"><form class="modal" @submit.prevent="createLibrary"><div class="modal-heading"><div><p class="eyebrow">NEW KNOWLEDGE BASE</p><h2>新增知识库</h2></div><button class="close-button" type="button" aria-label="关闭" @click="showCreateLibrary = false">×</button></div><label>名称<input v-model="newLibraryName" type="text" placeholder="例如：客服知识库" autofocus /></label><p v-if="createError" class="error-banner">{{ createError }}</p><div class="modal-actions"><button class="secondary-button" type="button" @click="showCreateLibrary = false">取消</button><button class="primary-button" type="submit" :disabled="!newLibraryName.trim()">创建知识库</button></div></form></div>
  </div>
</template>

<style>
:root { color: #222a2e; background: #f5f7f6; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-synthesis: none; text-rendering: optimizeLegibility; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .55; }
.app-shell { display: flex; min-height: 100vh; background: #f5f7f6; }
.sidebar { position: fixed; inset: 0 auto 0 0; display: flex; width: 252px; flex-direction: column; border-right: 1px solid #dfe6e2; background: #fff; }
.brand { display: flex; align-items: center; gap: 10px; padding: 24px 22px 28px; }
.brand-mark { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 7px; background: #1e7668; color: #fff; font-weight: 700; }
.brand strong, .brand span { display: block; }.brand strong { font-size: 14px; }.brand span { margin-top: 2px; color: #899590; font-size: 11px; }
.sidebar-heading { display: flex; align-items: center; justify-content: space-between; padding: 0 16px 9px 22px; color: #85918d; font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.icon-button, .close-button { border: 0; background: transparent; color: #53645f; font-size: 20px; line-height: 1; }.icon-button:hover, .close-button:hover { color: #1e7668; }
.library-list { display: grid; gap: 4px; padding: 0 10px; }.library-item { display: flex; width: 100%; align-items: center; gap: 10px; border: 1px solid transparent; border-radius: 7px; padding: 10px; background: transparent; color: #34413d; text-align: left; }.library-item:hover { background: #f3f7f5; }.library-item.selected { border-color: #cfe3dd; background: #eef7f4; }
.sidebar-empty { padding: 12px 22px; color: #9aa59f; font-size: 12px; }
.library-icon { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border: 1px solid #d8e4df; border-radius: 6px; color: #1e7668; font-size: 13px; font-weight: 700; }.library-copy { min-width: 0; flex: 1; }.library-copy strong, .library-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.library-copy strong { font-size: 13px; font-weight: 650; }.library-copy small { margin-top: 3px; color: #8a9691; font-size: 11px; }
.selected-dot, .online-dot { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 999px; background: #2d9b82; }.sidebar-footer { display: flex; align-items: center; gap: 7px; margin-top: auto; border-top: 1px solid #edf1ef; padding: 17px 22px; color: #899590; font-size: 11px; }
.main-content { width: calc(100% - 252px); min-width: 0; margin-left: 252px; padding: 42px clamp(24px, 5vw, 76px) 56px; }.page-header, .panel-heading, .modal-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }.eyebrow { margin: 0 0 9px; color: #84928c; font-size: 10px; font-weight: 750; letter-spacing: .12em; }h1, h2, p { margin-top: 0; }h1 { margin-bottom: 8px; color: #1d2926; font-size: clamp(24px, 3vw, 32px); }h2 { margin-bottom: 6px; color: #25312e; font-size: 17px; }.page-description, .panel-heading p { margin-bottom: 0; color: #7b8883; font-size: 13px; }
.primary-button, .secondary-button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; gap: 7px; border-radius: 6px; padding: 0 14px; font-size: 12px; font-weight: 650; white-space: nowrap; }.primary-button { border: 1px solid #1e7668; background: #1e7668; color: #fff; }.primary-button:hover { background: #155e53; }.secondary-button { border: 1px solid #d3ded9; background: #fff; color: #50605b; }.secondary-button:hover { border-color: #a9c8be; color: #1e7668; }
.stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; margin-top: 32px; border: 1px solid #dfe6e2; background: #dfe6e2; }.stat-item { display: grid; min-height: 82px; align-content: center; gap: 7px; padding: 15px 19px; background: #fff; }.stat-item span { color: #87938e; font-size: 11px; }.stat-item strong { color: #26332f; font-size: 21px; font-weight: 650; }.stat-item .ready-text { color: #23826f; font-size: 15px; }
.view-tabs { display: flex; gap: 23px; margin-top: 35px; border-bottom: 1px solid #dfe6e2; }.view-tab { position: relative; border: 0; padding: 0 0 12px; background: transparent; color: #899590; font-size: 13px; font-weight: 600; }.view-tab.active { color: #1e7668; }.view-tab.active::after { position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; background: #1e7668; content: ''; }
.workspace-panel { margin-top: 22px; border: 1px solid #dfe6e2; background: #fff; }.panel-heading { padding: 21px 22px; }.upload-zone { display: flex; width: calc(100% - 44px); min-height: 82px; align-items: center; justify-content: center; gap: 13px; margin: 0 22px 22px; border: 1px dashed #b8d0c8; border-radius: 6px; background: #f8fbfa; color: #53645f; text-align: left; }.upload-zone:hover { border-color: #1e7668; background: #f1f8f5; }.upload-symbol { display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid #c5ddd5; border-radius: 6px; color: #1e7668; font-size: 20px; }.upload-zone strong, .upload-zone small { display: block; }.upload-zone strong { font-size: 13px; }.upload-zone small { margin-top: 4px; color: #8b9792; font-size: 11px; }.hidden-input { display: none; }
.document-table-wrap { overflow-x: auto; border-top: 1px solid #edf1ef; }.document-table { width: 100%; min-width: 760px; border-collapse: collapse; text-align: left; }.document-table th, .document-table td { padding: 14px 22px; border-bottom: 1px solid #edf1ef; font-size: 12px; vertical-align: middle; }.document-table th { color: #8a9691; font-size: 10px; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }.document-table tbody tr:last-child td { border-bottom: 0; }.file-name-cell { display: flex; min-width: 190px; align-items: center; gap: 10px; }.file-type-mark { display: grid; width: 28px; height: 28px; flex: 0 0 auto; place-items: center; border-radius: 5px; background: #edf5f2; color: #277c6e; font-size: 9px; font-weight: 750; }.file-name-cell strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.muted-cell { color: #8a9691; }.status-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 8px; font-size: 10px; font-weight: 700; }.status-ready { background: #eaf6f1; color: #277d6c; }.status-pending { background: #fff5dc; color: #9c6c15; }.status-processing { background: #edf3fa; color: #527294; }.status-error { background: #fff0ee; color: #b25b50; }.row-actions { display: flex; justify-content: flex-end; gap: 10px; }.text-button { border: 0; padding: 0; background: transparent; color: #277c6e; font-size: 12px; }.text-button:hover { text-decoration: underline; }.text-button.danger { color: #ae6258; }
.file-link { display: flex; min-width: 190px; align-items: center; gap: 10px; border: 0; padding: 0; background: transparent; color: #2b3935; text-align: left; }.file-link:hover strong { color: #1e7668; text-decoration: underline; }
.status-uploaded { background: #eaf6f1; color: #277d6c; }
.error-banner { margin: 0 22px 16px; border: 1px solid #f0c9c3; border-radius: 5px; padding: 9px 11px; background: #fff5f3; color: #a9554a; font-size: 12px; }
.empty-state, .retrieval-placeholder { display: grid; min-height: 210px; place-items: center; align-content: center; gap: 7px; border-top: 1px solid #edf1ef; color: #8a9691; text-align: center; }.empty-state strong, .retrieval-placeholder strong { color: #52605b; font-size: 13px; }.empty-state span, .retrieval-placeholder span { font-size: 12px; }.empty-state.compact { min-height: 150px; }.mode-label { border: 1px solid #dbe9e4; border-radius: 999px; padding: 5px 9px; color: #588176; font-size: 10px; white-space: nowrap; }
.retrieval-form { border-top: 1px solid #edf1ef; border-bottom: 1px solid #edf1ef; padding: 18px 22px; }.retrieval-form label { display: block; margin-bottom: 8px; color: #66736e; font-size: 11px; font-weight: 700; }.retrieval-controls { display: flex; gap: 9px; }.retrieval-controls input, .retrieval-controls select, .search-field, .modal input, .modal textarea { border: 1px solid #d5e0db; border-radius: 5px; outline: 0; background: #fff; color: #283632; font-size: 12px; }.retrieval-controls input { min-width: 0; flex: 1; padding: 0 11px; }.retrieval-controls select { width: 92px; padding: 0 8px; }.retrieval-controls input:focus, .retrieval-controls select:focus, .search-field:focus-within, .modal input:focus, .modal textarea:focus { border-color: #62a795; box-shadow: 0 0 0 3px #e9f5f1; }.retrieval-result-heading { display: flex; justify-content: space-between; padding: 17px 22px 9px; color: #53645f; font-size: 12px; font-weight: 650; }.result-list { display: grid; gap: 9px; padding: 9px 22px 22px; }.result-item, .chunk-item { border: 1px solid #e2eae6; border-radius: 6px; padding: 14px 16px; background: #fbfcfc; }.result-meta, .chunk-heading { display: flex; min-width: 0; align-items: center; gap: 8px; }.rank-number { display: grid; width: 21px; height: 21px; flex: 0 0 auto; place-items: center; border-radius: 4px; background: #e9f4f0; color: #277c6e; font-size: 10px; font-weight: 750; }.result-meta strong, .chunk-heading strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.score { margin-left: auto; color: #277c6e; font-size: 11px; font-weight: 700; white-space: nowrap; }.result-item p, .chunk-item p { margin: 12px 0 9px 29px; color: #596762; font-size: 12px; line-height: 1.7; }.result-item small, .chunk-item small { display: block; margin-left: 29px; color: #9aa59f; font-size: 10px; }.search-symbol { color: #5b9789; font-size: 30px; line-height: 1; }
.search-field { display: flex; width: 220px; align-items: center; gap: 7px; padding: 0 10px; }.search-field span { color: #8b9792; font-size: 17px; }.search-field input { width: 100%; border: 0; outline: 0; padding: 9px 0; font-size: 12px; }.chunk-list { display: grid; gap: 9px; border-top: 1px solid #edf1ef; padding: 18px 22px 22px; }.chunk-heading { justify-content: space-between; }.chunk-heading > div { display: flex; min-width: 0; align-items: center; gap: 10px; }.chunk-heading span { color: #9aa59f; font-size: 10px; white-space: nowrap; }.token-count { border: 1px solid #e1eae6; border-radius: 4px; padding: 3px 6px; }
.back-button { border: 0; padding: 0; background: transparent; color: #277c6e; font-size: 11px; }.back-button:hover { text-decoration: underline; }
.modal-backdrop { position: fixed; z-index: 10; inset: 0; display: grid; place-items: center; background: rgb(29 41 38 / 26%); padding: 20px; }.modal { width: min(100%, 430px); border: 1px solid #dfe6e2; border-radius: 8px; background: #fff; box-shadow: 0 18px 50px rgb(28 50 43 / 15%); padding: 23px; }.modal-heading { margin-bottom: 22px; }.modal label { display: grid; gap: 7px; margin-top: 15px; color: #5b6964; font-size: 12px; font-weight: 650; }.modal input, .modal textarea { width: 100%; padding: 10px 11px; resize: vertical; }.modal-actions { display: flex; justify-content: flex-end; gap: 9px; margin-top: 23px; }
@media (max-width: 800px) { .sidebar { position: static; width: 100%; min-height: auto; border-right: 0; border-bottom: 1px solid #dfe6e2; }.app-shell { display: block; }.brand { padding: 17px 20px; }.sidebar-heading { padding: 0 20px 8px; }.library-list { display: flex; overflow-x: auto; padding: 0 14px 14px; }.library-item { width: 190px; flex: 0 0 auto; }.sidebar-footer { display: none; }.main-content { width: 100%; margin-left: 0; padding: 28px 16px 40px; } }
@media (max-width: 560px) { .page-header, .panel-heading { display: grid; }.page-header .primary-button, .panel-heading .secondary-button { width: 100%; }.stats-grid { grid-template-columns: 1fr; }.retrieval-controls { display: grid; grid-template-columns: 1fr 90px; }.retrieval-controls .primary-button { grid-column: 1 / -1; }.retrieval-result-heading { display: grid; gap: 5px; }.search-field { width: 100%; }.chunk-heading > div { display: grid; gap: 4px; } }
</style>
