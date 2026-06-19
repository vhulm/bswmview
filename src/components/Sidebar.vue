<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { useBswMStore } from '@/stores/bswm-store'
import type { NodeLayer } from '@/constants/layers'
import { LAYER_LABEL, LAYER_COLORS } from '@/constants/layers'
import { usePlatform } from '@/composables/usePlatform'

const props = withDefaults(defineProps<{
  width: number
}>(), { width: 256 })

const emit = defineEmits<{
  collapse: []
  'update:width': [width: number]
}>()

const store = useBswMStore()

// ---- 拖拽调整宽度 ----
const MIN_WIDTH = 180
const MAX_WIDTH = 480

let dragging = false
let startX = 0
let startWidth = 0

function onResizeMouseDown(e: MouseEvent) {
  dragging = true
  startX = e.clientX
  startWidth = props.width
  document.addEventListener('mousemove', onResizeMouseMove)
  document.addEventListener('mouseup', onResizeMouseUp)
  // 拖拽时禁止文本选中
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function onResizeMouseMove(e: MouseEvent) {
  if (!dragging) return
  const delta = e.clientX - startX
  const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta))
  emit('update:width', newWidth)
}

function onResizeMouseUp() {
  dragging = false
  document.removeEventListener('mousemove', onResizeMouseMove)
  document.removeEventListener('mouseup', onResizeMouseUp)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
}

onBeforeUnmount(() => {
  // 清理残留监听
  document.removeEventListener('mousemove', onResizeMouseMove)
  document.removeEventListener('mouseup', onResizeMouseUp)
})

// ---- 折叠状态 ----
const sectionCollapsed = ref<Record<string, boolean>>({
  requestPort: false,
  condition: false,
  expression: false,
  rule: false,
  actionList: false,
  action: false,
})

function toggleSection(layer: string) {
  sectionCollapsed.value[layer] = !sectionCollapsed.value[layer]
}

// ---- 图层过滤 ----
const layerFilterCollapsed = ref(false)

const layerEntries = computed(() =>
  (Object.keys(LAYER_LABEL) as NodeLayer[]).map(layer => ({
    layer,
    label: LAYER_LABEL[layer],
    visible: store.layerVisibility[layer],
  }))
)

// ---- 各类型列表数据 ----
interface EntityItem { name: string; path: string }

const entityLists = computed(() => {
  const m = store.model
  if (!m) return {} as Record<string, EntityItem[]>

  return {
    requestPort: Array.from(m.requestPorts.values()).map(e => ({ name: e.name, path: e.path })),
    condition: Array.from(m.conditions.values()).map(e => ({ name: e.name, path: e.path })),
    expression: Array.from(m.expressions.values()).map(e => ({ name: e.name, path: e.path })),
    rule: Array.from(m.rules.values()).map(e => ({ name: e.name, path: e.path })),
    actionList: Array.from(m.actionLists.values()).map(e => ({ name: e.name, path: e.path })),
    action: Array.from(m.actions.values()).map(e => ({ name: e.name, path: e.path })),
  }
})

// 列表配置：顺序、图标
const sections: { layer: string; icon: string }[] = [
  { layer: 'requestPort', icon: '📨' },
  { layer: 'condition', icon: '🔍' },
  { layer: 'expression', icon: '◆' },
  { layer: 'rule', icon: '⚖️' },
  { layer: 'actionList', icon: '📋' },
  { layer: 'action', icon: '⚡' },
]

function getLayerColor(layer: string): string {
  return (LAYER_COLORS[layer as NodeLayer]?.border) ?? '#666'
}

// ---- 文件加载 ----
const loadedFileName = ref('')
const lastFilePath = ref('')
const { isTauri, openNativeFile, reloadNativeFile } = usePlatform()

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  loadedFileName.value = file.name
  const reader = new FileReader()
  reader.onload = () => store.loadArxml(reader.result as string)
  reader.readAsText(file)
  input.value = ''
}

/** Tauri 环境：通过原生文件对话框打开文件 */
async function onOpenNativeFile() {
  try {
    const result = await openNativeFile()
    if (!result) return
    loadedFileName.value = result.name
    lastFilePath.value = result.path ?? ''
    await store.loadArxml(result.content)
  } catch (e) {
    console.error('打开文件失败:', e)
  }
}

/** Tauri 环境：重新加载上次打开的文件 */
async function onReloadFile() {
  if (!lastFilePath.value) return
  try {
    const result = await reloadNativeFile(lastFilePath.value)
    loadedFileName.value = result.name
    await store.loadArxml(result.content)
  } catch (e) {
    console.error('重新加载文件失败:', e)
  }
}

/** 加载示例文件（Tauri 和浏览器统一使用 fetch） */
async function loadDemo() {
  try {
    const resp = await fetch('/sample/BswM.arxml')
    if (!resp.ok) {
      console.warn('示例文件不可用:', resp.status, resp.statusText)
      return
    }
    const text = await resp.text()
    loadedFileName.value = 'BswM.arxml'
    lastFilePath.value = ''
    await store.loadArxml(text)
  } catch (e) {
    console.error('加载示例文件失败:', e)
  }
}

// ---- 聚焦实体 ----
function onEntityClick(path: string) {
  if (store.focusedNodePath === path) {
    store.clearFocus()
    store.selectNode(null)
  } else {
    store.focusNode(path)
    store.selectNode(path)
  }
}
</script>

<template>
  <div class="h-full bg-white flex flex-col overflow-hidden shrink-0 relative" :style="{ width: width + 'px' }">
    <!-- 内容区域 -->
    <div class="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
    <!-- 顶部：标题 + 折叠按钮 -->
    <div class="h-10 px-3 border-b border-gray-100 flex items-center justify-between shrink-0">
      <span class="text-sm font-semibold text-gray-700">📋 导航</span>
      <button
        @click="emit('collapse')"
        class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition cursor-pointer"
        title="折叠侧栏"
      >◂</button>
    </div>

    <!-- 文件加载区 -->
    <div class="p-3 border-b border-gray-100">
      <h3 class="text-xs font-semibold text-gray-500 mb-2">📁 加载文件</h3>
      <!-- 文件名 + 选择按钮 一行 -->
      <div class="flex items-center gap-2">
        <div class="flex-1 text-xs text-gray-400 truncate min-w-0">
          {{ loadedFileName || '未选择文件' }}
        </div>
        <!-- Tauri 环境：原生文件对话框 -->
        <button
          v-if="isTauri"
          @click="onOpenNativeFile"
          class="shrink-0 text-xs py-1 px-3 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition cursor-pointer"
        >选择文件</button>
        <!-- 浏览器环境：HTML file input -->
        <label v-else class="shrink-0 cursor-pointer text-xs py-1 px-3 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition">
          选择文件
          <input
            type="file"
            accept=".arxml,.xml"
            @change="onFileChange"
            class="hidden"
          />
        </label>
      </div>
      <button
        v-if="isTauri && lastFilePath"
        @click="onReloadFile"
        class="w-full text-xs py-1.5 px-3 bg-green-500 text-white rounded hover:bg-green-600 transition cursor-pointer mt-2"
      >
        🔄 重新加载
      </button>
      <button
        @click="loadDemo"
        class="w-full text-xs py-1.5 px-3 bg-blue-500 text-white rounded hover:bg-blue-600 transition cursor-pointer mt-2"
      >
        📄 加载示例 BswM.arxml
      </button>
    </div>

    <!-- 图层过滤 -->
    <div class="border-b border-gray-100">
      <button
        @click="layerFilterCollapsed = !layerFilterCollapsed"
        class="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition cursor-pointer"
      >
        <span class="text-xs font-semibold text-gray-500">🔍 图层过滤</span>
        <span class="text-gray-400 text-xs">{{ layerFilterCollapsed ? '▸' : '▾' }}</span>
      </button>
      <div v-if="!layerFilterCollapsed" class="px-3 pb-3 space-y-1">
        <label
          v-for="entry in layerEntries"
          :key="entry.layer"
          class="flex items-center gap-2 text-xs cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
        >
          <input
            type="checkbox"
            :checked="entry.visible"
            @change="store.toggleLayer(entry.layer)"
            class="rounded border-gray-300"
          />
          <span class="text-gray-600">{{ entry.label }}</span>
        </label>
      </div>
    </div>

    <!-- 实体类型列表 -->
    <div class="flex-1 overflow-y-auto">
      <div v-for="sec in sections" :key="sec.layer" class="border-b border-gray-100">
        <!-- 标题行 -->
        <button
          @click="toggleSection(sec.layer)"
          class="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 transition cursor-pointer"
        >
          <span class="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <span>{{ sec.icon }}</span>
            <span>{{ LAYER_LABEL[sec.layer as NodeLayer] }}</span>
            <span
              v-if="entityLists[sec.layer]"
              class="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500"
            >{{ entityLists[sec.layer].length }}</span>
          </span>
          <span class="text-gray-400 text-xs">{{ sectionCollapsed[sec.layer] ? '▸' : '▾' }}</span>
        </button>

        <!-- 列表 -->
        <div v-if="!sectionCollapsed[sec.layer]" class="pb-1">
          <div v-if="!entityLists[sec.layer]?.length" class="px-3 py-1 text-xs text-gray-400">暂无数据</div>
          <div
            v-for="item in entityLists[sec.layer]"
            :key="item.path"
            @click="onEntityClick(item.path)"
            class="px-3 py-1 mx-2 text-xs rounded cursor-pointer hover:bg-gray-50 transition truncate"
            :class="{
              'bg-red-50 text-red-700 font-medium': store.focusedNodePath === item.path,
              'opacity-40': store.unusedNodePaths.has(item.path)
            }"
            :style="{ borderLeftColor: getLayerColor(sec.layer), borderLeftWidth: '3px' }"
            :title="item.name"
          >
            {{ item.name }}
            <span v-if="store.unusedNodePaths.has(item.path)" class="text-gray-400 ml-1 text-[10px]">⚠未使用</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 统计信息 -->
    <div v-if="store.model" class="p-3 border-t border-gray-100 text-xs text-gray-500 shrink-0">
      <div class="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>RequestPorts: {{ store.model.requestPorts.size }}</span>
        <span>Conditions: {{ store.model.conditions.size }}</span>
        <span>Expressions: {{ store.model.expressions.size }}</span>
        <span>Rules: {{ store.model.rules.size }}</span>
        <span>ActionLists: {{ store.model.actionLists.size }}</span>
        <span>Actions: {{ store.model.actions.size }}</span>
      </div>
    </div>
    </div>
    <!-- 拖拽调整宽度手柄 -->
    <div
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-300 active:bg-blue-400 transition-colors z-10"
      @mousedown="onResizeMouseDown"
    ></div>
  </div>
</template>
