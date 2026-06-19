<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'

defineProps<{
  data: { label: string; detail: string; highlighted?: boolean; dimmed?: boolean; unused?: boolean }
}>()
</script>

<template>
  <div class="bswm-node bswm-node-action" :class="{ highlighted: data.highlighted, dimmed: data.dimmed, unused: data.unused }">
    <Handle type="target" :position="Position.Left" />
    <div class="node-title">⚡ {{ data.label }}</div>
    <div class="node-detail">{{ data.detail }}</div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>
