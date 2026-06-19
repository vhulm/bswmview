<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { useBswMStore } from '@/stores/bswm-store'
import { useVueFlow } from '@vue-flow/core'
import type { NodeLayer } from '@/types/bswm'
import { LAYER_LABEL } from '@/types/bswm'
import type { BswMNodeData } from '@/graph/graph-builder'

const store = useBswMStore()
const { fitView, zoomIn, zoomOut } = useVueFlow()

let relayoutTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (relayoutTimer) clearTimeout(relayoutTimer)
})

function onFitView() {
  fitView({ padding: 0.2 })
}

async function onRelayout() {
  await store.rebuildGraph()
  if (relayoutTimer) clearTimeout(relayoutTimer)
  relayoutTimer = setTimeout(() => {
    relayoutTimer = null
    fitView({ padding: 0.2 })
  }, 100)
}

// ---- 搜索下拉 ----
const searchKeyword = ref('')
const showDropdown = ref(false)

interface SearchResult {
  path: string
  label: string
  detail: string
  layer: NodeLayer
  /** 匹配得分，越低越靠前 */
  score: number
}

const searchResults = computed<SearchResult[]>(() => {
  const kw = searchKeyword.value.trim().toLowerCase()
  if (!kw || !store.nodes.length) return []
  const results: SearchResult[] = []
  for (const node of store.nodes) {
    const data = node.data as BswMNodeData | undefined
    if (!data) continue
    const label = (data.label ?? '').toLowerCase()
    const detail = (data.detail ?? '').toLowerCase()

    // 计算匹配得分（越低越优先）
    // 名称匹配始终优先于 detail 匹配，同级别内按位置微调
    let score = -1
    if (label === kw) {
      score = 0            // 完全匹配名称
    } else if (label.startsWith(kw)) {
      score = 1            // 名称前缀匹配
    } else if (label.includes(kw)) {
      score = 10 + Math.min(label.indexOf(kw), 89)  // 名称包含，上限 99，始终低于 detail 匹配
    } else if (detail === kw) {
      score = 100          // detail 完全匹配
    } else if (detail.includes(kw)) {
      score = 200 + Math.min(detail.indexOf(kw), 99) // detail 包含
    }

    if (score >= 0) {
      results.push({ path: node.id, label: data.label ?? '', detail: data.detail ?? '', layer: data.layer, score })
    }
  }
  // 按得分升序排列（得分低的排前面）
  results.sort((a, b) => a.score - b.score)
  return results.slice(0, 30)
})

function onSearchSelect(item: SearchResult) {
  store.focusNode(item.path)
  store.selectNode(item.path)
  showDropdown.value = false
  searchKeyword.value = ''
}

function onSearchBlur() {
  // 延迟关闭，让点击事件先触发
  setTimeout(() => { showDropdown.value = false }, 200)
}

function onSearchFocus() {
  if (searchResults.value.length > 0) showDropdown.value = true
}

function onClearSearch() {
  searchKeyword.value = ''
  showDropdown.value = false
  store.clearFocus()
}
</script>

<template>
  <div class="h-10 bg-white border-b border-gray-200 flex items-center px-3 gap-2">
    <span class="text-sm font-semibold text-gray-700">BswM Viewer</span>
    <span class="text-xs text-gray-400">AUTOSAR 配置可视化</span>
    <div class="w-px h-5 bg-gray-300 mx-1"></div>

    <button @click="zoomIn()" class="tool-btn" title="放大">➕</button>
    <button @click="zoomOut()" class="tool-btn" title="缩小">➖</button>
    <button @click="onFitView" class="tool-btn" title="适应画布">🔲</button>

    <div class="w-px h-5 bg-gray-300 mx-1"></div>

    <button @click="onRelayout" class="tool-btn" title="重新布局">🔄</button>

    <!-- 撤销高亮按钮：仅在选中状态时显示 -->
    <button
      v-if="store.focusedNodePath"
      @click="store.clearFocus(); store.selectNode(null)"
      class="tool-btn !bg-red-50 !text-red-600 hover:!bg-red-100"
      title="撤销高亮"
    >✕ 清除高亮</button>

    <div class="flex-1"></div>

    <!-- 搜索框 + 下拉 -->
    <div class="relative">
      <div class="flex items-center">
        <input
          v-model="searchKeyword"
          placeholder="搜索实体名..."
          class="text-xs border border-gray-300 rounded-l px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-blue-400"
          @focus="onSearchFocus"
          @blur="onSearchBlur"
          @input="showDropdown = searchResults.length > 0"
        />
        <button
          v-if="searchKeyword"
          @click="onClearSearch"
          class="text-xs border border-l-0 border-gray-300 rounded-r px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-500"
        >✕</button>
        <div v-else class="text-xs border border-l-0 border-gray-300 rounded-r px-2 py-1 bg-gray-50 text-gray-400">🔍</div>
      </div>
      <!-- 下拉列表 -->
      <div
        v-if="showDropdown && searchResults.length > 0"
        class="absolute right-0 top-full mt-1 w-72 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg z-50"
      >
        <div
          v-for="item in searchResults"
          :key="item.path"
          @mousedown.prevent="onSearchSelect(item)"
          class="px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-xs flex items-center gap-2"
        >
          <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
                :class="{
                  'bg-blue-100 text-blue-700': item.layer === 'requestPort',
                  'bg-orange-100 text-orange-700': item.layer === 'condition',
                  'bg-purple-100 text-purple-700': item.layer === 'expression',
                  'bg-green-100 text-green-700': item.layer === 'rule',
                  'bg-amber-100 text-amber-700': item.layer === 'actionList',
                  'bg-red-100 text-red-700': item.layer === 'action',
                }"
          >{{ LAYER_LABEL[item.layer] }}</span>
          <span class="text-gray-800 truncate">{{ item.label }}</span>
        </div>
      </div>
    </div>

    <div v-if="store.loading" class="text-xs text-blue-500 animate-pulse">加载中...</div>
    <div v-if="store.error" class="text-xs text-red-500">❌ {{ store.error }}</div>
  </div>
</template>

<style scoped>
@reference "tailwindcss";

.tool-btn {
  @apply text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 transition cursor-pointer select-none;
}
</style>
