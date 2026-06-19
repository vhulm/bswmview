<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, markRaw } from 'vue'
import type { Component } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import type { NodeMouseEvent } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'

import RequestPortNode from '@/components/nodes/RequestPortNode.vue'
import ConditionNode from '@/components/nodes/ConditionNode.vue'
import ExpressionNode from '@/components/nodes/ExpressionNode.vue'
import RuleNode from '@/components/nodes/RuleNode.vue'
import ActionListNode from '@/components/nodes/ActionListNode.vue'
import ActionNode from '@/components/nodes/ActionNode.vue'

import Sidebar from './Sidebar.vue'
import Toolbar from './Toolbar.vue'
import DetailPanel from './DetailPanel.vue'

import { useBswMStore } from '@/stores/bswm-store'
import { useGraphFilter } from '@/composables/useGraphFilter'

const store = useBswMStore()
const { fitView, onNodeClick } = useVueFlow()

// 侧边栏折叠状态
const sidebarCollapsed = ref(false)
// 侧边栏宽度（可拖拽调整）
const sidebarWidth = ref(256)

// markRaw 防止组件被 Vue 响应式系统代理，避免性能警告
const nodeTypes: Record<string, Component> = {
  requestPort: markRaw(RequestPortNode),
  condition: markRaw(ConditionNode),
  expression: markRaw(ExpressionNode),
  rule: markRaw(RuleNode),
  actionList: markRaw(ActionListNode),
  action: markRaw(ActionNode),
}

// ---- 图中节点点击 → 选中 + 聚焦 ----
onNodeClick((event: NodeMouseEvent) => {
  const path = event.node.data?.path ?? null
  store.selectNode(path)
  store.focusNode(path)
})

// ---- 图层过滤 + 链路高亮 + dimmed 标注（独立 composable） ----
const { filteredNodes, filteredEdges } = useGraphFilter()

// ---- 定时器清理 ----
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

function scheduleTimeout(fn: () => void, ms: number) {
  const id = setTimeout(() => {
    pendingTimers.delete(id)
    fn()
  }, ms)
  pendingTimers.add(id)
}

onBeforeUnmount(() => {
  for (const id of pendingTimers) clearTimeout(id)
  pendingTimers.clear()
})

// ---- 聚焦节点变化时 fitView ----
watch(() => store.focusedNodePath, (path) => {
  if (!path) return
  const chainIds = store.focusedChainIds
  // 有链路时聚焦链路，无链路时（如 ModeInitValue）聚焦单个节点
  const targetIds: string[] = []
  if (chainIds) {
    for (const node of store.nodes) {
      if (chainIds.has(node.id)) targetIds.push(node.id)
    }
  } else {
    // 节点不在邻接表中，仅聚焦自身
    for (const node of store.nodes) {
      if (node.id === path) { targetIds.push(node.id); break }
    }
  }
  if (targetIds.length > 0) {
    scheduleTimeout(() => fitView({ nodes: targetIds, padding: 0.3, duration: 500 }), 100)
  }
})

onMounted(async () => {
  // 统一使用 fetch 加载示例文件（Tauri 和浏览器都适用）
  try {
    const resp = await fetch('/sample/BswM.arxml')
    if (resp.ok) {
      const text = await resp.text()
      await store.loadArxml(text)
      scheduleTimeout(() => fitView({ padding: 0.2 }), 500)
    }
  } catch (e) {
    console.warn('自动加载示例文件失败:', e)
  }
})
</script>

<template>
  <div class="w-full h-full flex">
    <!-- 侧边栏：展开 -->
    <Sidebar v-if="!sidebarCollapsed" v-model:width="sidebarWidth" @collapse="sidebarCollapsed = true" />

    <!-- 侧边栏：折叠态 — 竖条 + 展开按钮 -->
    <div
      v-else
      class="w-8 h-full bg-white border-r border-gray-200 flex flex-col items-center pt-2"
    >
      <button
        @click="sidebarCollapsed = false"
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition cursor-pointer"
        title="展开侧栏"
      >▸</button>
    </div>

    <!-- 主区域 -->
    <div class="flex-1 flex flex-col min-w-0">
      <Toolbar />

      <div class="flex-1 relative">
        <VueFlow
          v-model:nodes="filteredNodes"
          v-model:edges="filteredEdges"
          :node-types="nodeTypes"
          :default-viewport="{ zoom: 0.6, x: 50, y: 50 }"
          :min-zoom="0.1"
          :max-zoom="2"
          fit-view-on-init
          class="w-full h-full"
        >
          <Background :gap="20" :size="1" />
          <Controls position="bottom-right" />
        </VueFlow>

        <div
          v-if="store.nodes.length === 0 && !store.loading"
          class="absolute inset-0 flex items-center justify-center bg-white/80"
        >
          <div class="text-center">
            <div class="text-5xl mb-4">📊</div>
            <div class="text-gray-600 text-lg font-medium">BswM 配置可视化工具</div>
            <div class="text-gray-400 text-sm mt-2">请从左侧加载 ARXML 文件</div>
          </div>
        </div>
      </div>
    </div>

    <DetailPanel />
  </div>
</template>
