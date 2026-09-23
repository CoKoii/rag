<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  create: [name: string]
}>()

const name = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) name.value = ''
  },
)
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <form class="modal" @submit.prevent="emit('create', name)">
      <div class="modal-heading">
        <div>
          <p class="eyebrow">NEW KNOWLEDGE BASE</p>
          <h2>新增知识库</h2>
        </div>
        <button class="close-button" type="button" aria-label="关闭" @click="emit('close')">
          ×
        </button>
      </div>
      <label
        >名称<input v-model="name" type="text" placeholder="例如：客服知识库" autofocus
      /></label>
      <p v-if="error" class="error-banner">{{ error }}</p>
      <div class="modal-actions">
        <button class="secondary-button" type="button" :disabled="busy" @click="emit('close')">
          取消
        </button>
        <button class="primary-button" type="submit" :disabled="busy || !name.trim()">
          创建知识库
        </button>
      </div>
    </form>
  </div>
</template>
