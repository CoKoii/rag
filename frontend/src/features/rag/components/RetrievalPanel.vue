<script setup lang="ts">
import { ref } from 'vue'
import type { RetrievalResult } from '../types'

defineProps<{ results: RetrievalResult[]; loading: boolean }>()

const emit = defineEmits<{
  retrieve: [query: string, topK: number]
}>()

const query = ref('如何配置数据库连接？')
const topK = ref(5)
const hasRun = ref(false)

const run = () => {
  const value = query.value.trim()
  if (!value) return
  hasRun.value = true
  emit('retrieve', value, topK.value)
}
</script>

<template>
  <section class="workspace-panel">
    <div class="panel-heading">
      <div>
        <h2>召回测试</h2>
        <p>使用当前知识库中的向量进行语义检索。</p>
      </div>
      <span class="mode-label">Dense Retrieval · Qdrant</span>
    </div>
    <form class="retrieval-form" @submit.prevent="run">
      <label for="retrieval-query">测试问题</label>
      <div class="retrieval-controls">
        <input id="retrieval-query" v-model="query" type="text" placeholder="输入你想检索的问题" />
        <select v-model="topK" aria-label="返回数量">
          <option :value="3">Top 3</option>
          <option :value="5">Top 5</option>
          <option :value="8">Top 8</option>
        </select>
        <button class="primary-button" type="submit" :disabled="loading">
          {{ loading ? '正在召回…' : '开始召回' }}
        </button>
      </div>
    </form>
    <div v-if="loading" class="empty-state compact">
      <strong>正在执行向量检索</strong><span>请稍候。</span>
    </div>
    <div v-else-if="hasRun" class="retrieval-result-heading">
      <span>返回 {{ results.length }} 个结果</span><span class="muted-cell">按相似度排序</span>
    </div>
    <div v-if="!loading && hasRun && results.length" class="result-list">
      <article v-for="(result, index) in results" :key="result.id" class="result-item">
        <div class="result-meta">
          <span class="rank-number">{{ index + 1 }}</span>
          <strong>{{ result.documentName }}</strong>
          <span class="score">相似度 {{ result.score.toFixed(4) }}</span>
        </div>
        <p>{{ result.content }}</p>
        <small>Chunk {{ result.index }}</small>
      </article>
    </div>
    <div v-else-if="!loading && hasRun" class="empty-state compact">
      <strong>没有召回结果</strong><span>请先完成切片和 Embedding。</span>
    </div>
    <div v-else-if="!loading" class="retrieval-placeholder">
      <span class="search-symbol">⌕</span><strong>输入问题开始测试</strong
      ><span>结果来自当前知识库的 Qdrant 向量搜索。</span>
    </div>
  </section>
</template>
