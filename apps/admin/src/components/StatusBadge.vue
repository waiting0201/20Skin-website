<script setup lang="ts">
// 狀態徽章。docs/11-backend-design.md §7：狀態只有四個，「已排程」是
// Status=3 && PublishAt > now 推導出來的顯示狀態，不是第五個資料庫值。
import { computed } from 'vue'
import type { ContentStatus } from '@/types'
import { STATUS_LABEL } from '@/types'

const props = defineProps<{ status: ContentStatus; publishAt?: string | null }>()

const isScheduled = computed(() => props.status === 3 && Boolean(props.publishAt) && new Date(props.publishAt!).getTime() > Date.now())

const modifier = computed(() => {
  if (isScheduled.value) return 'scheduled'
  return { 1: 'draft', 2: 'review', 3: 'published', 4: 'unpublished' }[props.status]
})

const label = computed(() => (isScheduled.value ? '已排程' : STATUS_LABEL[props.status]))
</script>

<template>
  <span class="adm-badge" :class="`adm-badge--${modifier}`">{{ label }}</span>
</template>
