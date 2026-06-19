<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import type { BaseNodeProps } from './BaseNodeProps'

defineProps<{ data: BaseNodeProps }>()
</script>

<template>
  <div class="bswm-node bswm-node-rule" :class="{ highlighted: data.highlighted, dimmed: data.dimmed, unused: data.unused }">
    <Handle type="target" :position="Position.Left" />
    <div class="node-title">⚖️ {{ data.label }}</div>
    <div class="node-detail">Init: {{ data.detail }}</div>
    <!-- True 输出: 右上方 -->
    <Handle type="source" :position="Position.Right" id="true" style="top: 30%" />
    <!-- False 输出: 右下方 -->
    <Handle type="source" :position="Position.Right" id="false" style="top: 70%" />
  </div>
</template>
