<script setup lang="ts">
import type { ChunkItem } from '../types'

defineProps<{
  documentName: string
  chunks: ChunkItem[]
  search: string
  loading: boolean
}>()

const emit = defineEmits<{
  back: []
  'update:search': [value: string]
}>()
</script>

<template>
  <section class="workspace-panel">
    <div class="panel-heading">
      <div>
        <button class="back-button" type="button" @click="emit('back')">← 返回文件列表</button>
        <h2>{{ documentName || '文件切片' }}</h2>
        <p>切片列表仅展示正文内容。</p>
      </div>
      <label class="search-field"
        ><span>⌕</span
        ><input
          :value="search"
          type="search"
          placeholder="搜索切片内容"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      /></label>
    </div>
    <div v-if="loading" class="empty-state"><strong>正在加载切片</strong><span>请稍候。</span></div>
    <div v-else-if="chunks.length" class="chunk-list">
      <article v-for="chunk in chunks" :key="chunk.id" class="chunk-item">
        <p>{{ chunk.content }}</p>
      </article>
    </div>
    <div v-else class="empty-state">
      <strong>没有匹配的切片</strong><span>调整搜索关键词，或先解析并切片 Markdown 文件。</span>
    </div>
  </section>
</template>
