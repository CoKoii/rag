<script setup lang="ts">
import type { KnowledgeBase } from '../types'

defineProps<{
  knowledgeBases: KnowledgeBase[]
  selectedId: string
  documentCounts: Record<string, number>
}>()

const emit = defineEmits<{
  select: [id: string]
  create: []
}>()
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">R</div>
      <div><strong>RAG Lab</strong><span>Knowledge workspace</span></div>
    </div>
    <div class="sidebar-heading">
      <span>知识库</span
      ><button class="icon-button" type="button" title="新增知识库" @click="emit('create')">
        +
      </button>
    </div>
    <nav v-if="knowledgeBases.length" class="library-list" aria-label="知识库列表">
      <button
        v-for="base in knowledgeBases"
        :key="base.id"
        class="library-item"
        :class="{ selected: base.id === selectedId }"
        type="button"
        @click="emit('select', base.id)"
      >
        <span class="library-icon">{{ base.name.slice(0, 1) }}</span>
        <span class="library-copy"
          ><strong>{{ base.name }}</strong
          ><small>{{ documentCounts[base.id] ?? 0 }} 个文件</small></span
        >
        <span v-if="base.id === selectedId" class="selected-dot"></span>
      </button>
    </nav>
    <div v-else class="sidebar-empty">暂无知识库</div>
    <div class="sidebar-footer"><span class="online-dot"></span><span>本地 Demo 模式</span></div>
  </aside>
</template>
