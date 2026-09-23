<script setup lang="ts">
import type { DocumentItem, DocumentStatus } from '../types'

defineProps<{
  documents: DocumentItem[]
  loading: boolean
  uploading: boolean
  hasKnowledgeBase: boolean
}>()

const emit = defineEmits<{
  pick: []
  upload: [files: FileList]
  chunks: [document: DocumentItem]
  original: [document: DocumentItem]
  parse: [document: DocumentItem]
  chunk: [document: DocumentItem]
  remove: [document: DocumentItem]
}>()

const statusLabels: Record<DocumentStatus, string> = {
  uploaded: '待解析',
  processing: '解析中',
  ready: '已解析',
  failed: '解析失败',
}

const canParse = (document: DocumentItem) => /\.(md|markdown|png|jpe?g|webp)$/i.test(document.name)

const dropFiles = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer?.files.length) emit('upload', event.dataTransfer.files)
}
</script>

<template>
  <section class="workspace-panel">
    <div class="panel-heading">
      <div>
        <h2>文件列表</h2>
        <p>上传 Markdown 和图片后，可解析并切片。</p>
      </div>
    </div>
    <div v-if="loading" class="empty-state compact">
      <strong>正在加载文件</strong><span>请稍候。</span>
    </div>
    <template v-else>
      <button
        class="upload-zone"
        type="button"
        :disabled="!hasKnowledgeBase || uploading"
        @click="emit('pick')"
        @dragover.prevent
        @drop="dropFiles"
      >
        <span class="upload-symbol">↑</span>
        <span
          ><strong>{{
            uploading
              ? '正在上传…'
              : hasKnowledgeBase
                ? '点击或拖拽文件到这里上传'
                : '请先创建知识库'
          }}</strong
          ><small>支持 TXT、Markdown、PDF、PNG、JPG、JPEG、WebP，单个文件最大 10 MB</small></span
        >
      </button>
      <div v-if="documents.length" class="document-table-wrap">
        <table class="document-table">
          <thead>
            <tr>
              <th>文件名</th>
              <th>切片</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="document in documents" :key="document.id">
              <td>
                <button class="file-link" type="button" @click="emit('chunks', document)">
                  <strong>{{ document.name }}</strong>
                </button>
              </td>
              <td class="muted-cell">{{ document.chunkCount || '-' }}</td>
              <td>
                <span class="status-pill" :class="`status-${document.status}`">{{
                  statusLabels[document.status]
                }}</span>
              </td>
              <td>
                <div class="row-actions">
                  <button class="text-button" type="button" @click="emit('original', document)">
                    原文件
                  </button>
                  <button
                    class="text-button"
                    type="button"
                    :disabled="!canParse(document)"
                    :title="canParse(document) ? '' : '当前格式暂不支持解析'"
                    @click="emit('parse', document)"
                  >
                    {{ document.parsed ? '重新解析' : '解析' }}
                  </button>
                  <button
                    class="text-button"
                    type="button"
                    :disabled="!document.parsed"
                    :title="document.parsed ? '' : '请先解析文件'"
                    @click="emit('chunk', document)"
                  >
                    {{ document.chunkCount ? '重新切片' : '切片' }}
                  </button>
                  <button
                    class="text-button danger"
                    type="button"
                    @click="emit('remove', document)"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">
        <strong>还没有文件</strong
        ><span>{{
          hasKnowledgeBase ? '上传 Markdown 文档或图片开始处理。' : '点击左侧加号创建知识库。'
        }}</span>
      </div>
    </template>
  </section>
</template>
