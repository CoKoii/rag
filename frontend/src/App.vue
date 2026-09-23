<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ragApi } from './features/rag/api'
import ChunkPanel from './features/rag/components/ChunkPanel.vue'
import DocumentPanel from './features/rag/components/DocumentPanel.vue'
import KnowledgeBaseDialog from './features/rag/components/KnowledgeBaseDialog.vue'
import KnowledgeBaseSidebar from './features/rag/components/KnowledgeBaseSidebar.vue'
import ParseDialog from './features/rag/components/ParseDialog.vue'
import RetrievalPanel from './features/rag/components/RetrievalPanel.vue'
import { useRagWorkspace } from './features/rag/composables/useRagWorkspace'
import type { DocumentItem } from './features/rag/types'

const workspace = useRagWorkspace()
const {
  backToDocuments,
  chunkCount,
  chunkSearch,
  chunksLoading,
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
  loading,
  openChunks,
  openParse,
  openRetrieval,
  parseDialogOpen,
  parseError,
  parseLoading,
  parseTarget,
  parsedData,
  parsing,
  retrievalLoading,
  removeDocument,
  runChunking,
  runParse,
  selectBase,
  selectedBase,
  selectedBaseId,
  selectedDocument,
  uploadFiles,
  uploading,
  view,
  chunks,
} = workspace
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(workspace.load)

const openOriginal = (document: DocumentItem) => {
  const url = ragApi.originalFileUrl(workspace.selectedBaseId.value, document.id)
  window.open(url, '_blank', 'noopener,noreferrer')
}

const openFilePicker = () => {
  workspace.view.value = 'documents'
  fileInput.value?.click()
}

const selectFiles = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files?.length) void workspace.uploadFiles(input.files)
  input.value = ''
}
</script>

<template>
  <div class="app-shell">
    <KnowledgeBaseSidebar
      :knowledge-bases="knowledgeBases"
      :selected-id="selectedBaseId"
      :document-counts="documentCounts"
      @select="selectBase"
      @create="createDialogOpen = true"
    />

    <main class="main-content">
      <header class="page-header">
        <div>
          <p class="eyebrow">KNOWLEDGE BASE</p>
          <h1>{{ selectedBase?.name || '知识库工作台' }}</h1>
          <p class="page-description">
            {{ selectedBase ? '当前知识库文件' : '先创建一个知识库，再上传文档。' }}
          </p>
        </div>
        <button
          class="primary-button"
          type="button"
          :disabled="!selectedBaseId || uploading"
          @click="openFilePicker"
        >
          {{ uploading ? '上传中…' : '+ 上传文件' }}
        </button>
      </header>

      <section class="stats-grid">
        <div class="stat-item">
          <span>文件数</span><strong>{{ documents.length }}</strong>
        </div>
        <div class="stat-item">
          <span>切片数</span><strong>{{ chunkCount }}</strong>
        </div>
        <div class="stat-item"><span>索引状态</span><strong class="ready-text">未索引</strong></div>
      </section>

      <nav class="view-tabs" aria-label="工作区视图">
        <button
          class="view-tab"
          :class="{ active: view === 'documents' }"
          type="button"
          @click="backToDocuments"
        >
          文件列表
        </button>
        <button
          class="view-tab"
          :class="{ active: view === 'retrieval' }"
          type="button"
          @click="openRetrieval"
        >
          召回测试
        </button>
      </nav>

      <p v-if="error" class="error-banner page-error">{{ error }}</p>
      <input
        ref="fileInput"
        class="hidden-input"
        type="file"
        accept=".txt,.md,.pdf"
        multiple
        @change="selectFiles"
      />

      <DocumentPanel
        v-if="view === 'documents'"
        :documents="documents"
        :loading="loading"
        :uploading="uploading"
        :has-knowledge-base="Boolean(selectedBaseId)"
        @pick="openFilePicker"
        @upload="uploadFiles"
        @chunks="openChunks"
        @original="openOriginal"
        @parse="openParse"
        @chunk="runChunking"
        @remove="removeDocument"
      />
      <RetrievalPanel
        v-else-if="view === 'retrieval'"
        :chunks="chunks"
        :loading="retrievalLoading"
      />
      <ChunkPanel
        v-else
        :document-name="selectedDocument?.name ?? ''"
        :chunks="filteredChunks"
        :search="chunkSearch"
        :loading="chunksLoading"
        @update:search="chunkSearch = $event"
        @back="backToDocuments"
      />
    </main>

    <KnowledgeBaseDialog
      :open="createDialogOpen"
      :busy="creatingBase"
      :error="createError"
      @close="createDialogOpen = false"
      @create="createBase"
    />
    <ParseDialog
      :open="parseDialogOpen"
      :document="parseTarget"
      :data="parsedData"
      :loading="parseLoading"
      :busy="parsing"
      :error="parseError"
      @close="closeParse"
      @parse="runParse"
    />
  </div>
</template>
