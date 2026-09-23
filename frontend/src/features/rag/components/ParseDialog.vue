<script setup lang="ts">
import { computed } from 'vue'
import type { DocumentItem, ParsedDocument } from '../types'

const props = defineProps<{
  open: boolean
  document: DocumentItem | null
  data: ParsedDocument | null
  loading: boolean
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  parse: []
}>()

const formattedData = computed(() => (props.data ? JSON.stringify(props.data, null, 2) : ''))
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <section class="modal parse-modal">
      <div class="modal-heading">
        <div>
          <p class="eyebrow">DOCUMENT PARSER</p>
          <h2>{{ document?.name || '文档解析' }}</h2>
        </div>
        <button
          class="close-button"
          type="button"
          aria-label="关闭"
          :disabled="busy"
          @click="emit('close')"
        >
          ×
        </button>
      </div>
      <p class="parse-description">文档解析为统一树形 JSON；图片由 Qwen 多模态模型提取文字和语义。</p>
      <p v-if="error" class="error-banner">{{ error }}</p>
      <div v-if="loading" class="empty-state compact">
        <strong>正在读取解析结果</strong><span>请稍候。</span>
      </div>
      <pre v-else-if="data" class="json-view">{{ formattedData }}</pre>
      <div v-else class="empty-state compact">
        <strong>当前文件还没有解析结果</strong><span>执行解析后可在此查看 JSON。</span>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" type="button" :disabled="busy" @click="emit('close')">
          关闭
        </button>
        <button
          class="primary-button"
          type="button"
          :disabled="loading || busy"
          @click="emit('parse')"
        >
          {{ busy ? '解析中…' : data ? '重新解析' : '执行解析' }}
        </button>
      </div>
    </section>
  </div>
</template>
