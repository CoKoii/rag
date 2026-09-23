<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ChunkItem } from '../types'

const props = defineProps<{ chunks: ChunkItem[]; loading: boolean }>()

const query = ref('如何配置数据库连接？')
const topK = ref(5)
const hasRun = ref(false)

const results = computed(() => {
  if (!query.value.trim()) return []
  return props.chunks.slice(0, topK.value).map((chunk, index) => ({
    ...chunk,
    score: Number((0.94 - index * 0.07).toFixed(2)),
  }))
})

const run = () => {
  if (query.value.trim()) hasRun.value = true
}
</script>

<template>
  <section class="workspace-panel">
    <div class="panel-heading">
      <div>
        <h2>召回测试</h2>
        <p>当前为本地模拟结果，尚未接入向量检索。</p>
      </div>
      <span class="mode-label">Dense Retrieval · Mock</span>
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
          {{ loading ? '加载切片…' : '开始召回' }}
        </button>
      </div>
    </form>
    <div v-if="loading" class="empty-state compact">
      <strong>正在加载切片</strong><span>请稍候。</span>
    </div>
    <div v-else-if="hasRun" class="retrieval-result-heading">
      <span>返回 {{ results.length }} 个结果</span
      ><span class="muted-cell">模拟排序 · 非语义相似度</span>
    </div>
    <div v-if="!loading && hasRun && results.length" class="result-list">
      <article v-for="(result, index) in results" :key="result.id" class="result-item">
        <div class="result-meta">
          <span class="rank-number">{{ index + 1 }}</span
          ><strong>{{ result.documentName }}</strong
          ><span class="muted-cell">{{ result.sectionPaths.flat().join(' → ') }}</span
          ><span class="score">模拟分 {{ result.score }}</span>
        </div>
        <p>{{ result.content }}</p>
        <small>Chunk {{ result.index }} · {{ result.tokenCount }} tokens</small>
      </article>
    </div>
    <div v-else-if="!loading && hasRun" class="empty-state compact">
      <strong>还没有可召回的切片</strong><span>请先解析并切片 Markdown 文件。</span>
    </div>
    <div v-else-if="!loading" class="retrieval-placeholder">
      <span class="search-symbol">⌕</span><strong>输入问题开始测试</strong
      ><span>当前结果为演示数据，不代表真实向量召回。</span>
    </div>
  </section>
</template>
