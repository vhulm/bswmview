<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'

const props = defineProps<{
  data: { label: string; detail: string; highlighted?: boolean; dimmed?: boolean; unused?: boolean }
}>()

const opSymbol = computed(() => {
  switch (props.data.detail) {
    case 'AND':  return '∧'
    case 'OR':   return '∨'
    case 'XOR':  return '⊕'
    case 'NAND': return '⊼'
    case 'NOR':  return '⊽'
    case 'NOT':  return '¬'
    default:     return '◆'
  }
})
</script>

<template>
  <div class="bswm-node bswm-node-expression" :class="{ highlighted: data.highlighted, dimmed: data.dimmed, unused: data.unused }">
    <Handle type="target" :position="Position.Left" />
    <div class="node-title">{{ opSymbol }} {{ data.label }}</div>
    <div class="node-detail">{{ data.detail }}</div>
    <Handle type="source" :position="Position.Right" />
  </div>
</template>
