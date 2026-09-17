<script setup lang="ts">
// 拖曳把手（六點）。三個排序畫面共用，搭配 `drag-sort.ts` 的 `handleProps()`：
//   <DragHandle v-bind="drag.handleProps(item.id)" />
// class／title／aria-hidden／滑鼠事件都由 handleProps 帶進來（fallthrough），
// 這裡只負責畫圖示 —— 所以樣式一律改 admin.css §18 的 .adm-drag-handle。
</script>

<template>
  <span>
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="3" r="1.4" />
      <circle cx="10" cy="3" r="1.4" />
      <circle cx="6" cy="8" r="1.4" />
      <circle cx="10" cy="8" r="1.4" />
      <circle cx="6" cy="13" r="1.4" />
      <circle cx="10" cy="13" r="1.4" />
    </svg>
  </span>
</template>
