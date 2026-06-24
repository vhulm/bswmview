<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { useBswMStore } from '@/stores/bswm-store'
import { LAYER_COLORS, LAYER_LABEL, ENTITY_LAYER_MAP } from '@/constants/layers'
import { EntityDetail } from './EntityDetailRender'

const props = withDefaults(defineProps<{
  width: number
}>(), { width: 288 })

const emit = defineEmits<{
  'update:width': [width: number]
}>()

const store = useBswMStore()

// ---- 拖拽调整宽度 ----
const MIN_WIDTH = 200
const MAX_WIDTH = 560

let dragging = false
let startX = 0
let startWidth = 0

function onResizeMouseDown(e: MouseEvent) {
  dragging = true
  startX = e.clientX
  startWidth = props.width
  document.addEventListener('mousemove', onResizeMouseMove)
  document.addEventListener('mouseup', onResizeMouseUp)
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
}

function onResizeMouseMove(e: MouseEvent) {
  if (!dragging) return
  // 右侧面板拖左边缘：鼠标左移 → 宽度增大
  const delta = startX - e.clientX
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
  document.removeEventListener('mousemove', onResizeMouseMove)
  document.removeEventListener('mouseup', onResizeMouseUp)
})

// ---- 选中实体信息 ----
const selectedEntity = computed(() => {
  if (!store.selectedNodePath || !store.model) return null
  return store.model.entities.get(store.selectedNodePath) ?? null
})

const entityType = computed(() => {
  const entity = selectedEntity.value
  if (!entity) return null
  return ENTITY_LAYER_MAP[entity.type] ?? null
})

/** 获取引用目标的显示名 */
function getRefTargetName(targetPath: string): string {
  const target = store.model?.entities.get(targetPath)
  return target?.name ?? targetPath.split('/').pop() ?? targetPath
}
</script>

<template>
  <div v-if="selectedEntity && entityType" class="h-full bg-white border-l border-gray-200 overflow-hidden shrink-0 relative" :style="{ width: width + 'px' }">
    <!-- 内容区域 -->
    <div class="flex-1 flex flex-col overflow-hidden border-r border-gray-200">
      <!-- 标题行 -->
      <div class="p-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <h3 class="text-sm font-semibold" :style="{ color: LAYER_COLORS[entityType]?.border ?? '#666' }">
          {{ LAYER_LABEL[entityType] ?? entityType }}
        </h3>
        <button @click="store.selectNode(null)" class="text-gray-400 hover:text-gray-600 text-sm cursor-pointer">✕</button>
      </div>

      <!-- 详情内容 -->
      <div class="p-3 space-y-2 overflow-y-auto flex-1">
        <!-- 基本字段 -->
        <div class="text-xs">
          <div class="text-gray-500 mb-0.5">名称</div>
          <div class="text-gray-800 font-mono bg-gray-50 rounded px-2 py-1 break-all text-[11px]">{{ selectedEntity.name }}</div>
        </div>
        <div class="text-xs">
          <div class="text-gray-500 mb-0.5">类型</div>
          <div class="text-gray-800 font-mono bg-gray-50 rounded px-2 py-1 break-all text-[11px]">{{ selectedEntity.type }}</div>
        </div>
        <div class="text-xs">
          <div class="text-gray-500 mb-0.5">路径</div>
          <div class="text-gray-800 font-mono bg-gray-50 rounded px-2 py-1 break-all text-[11px]">{{ selectedEntity.path }}</div>
        </div>

        <!-- 递归展示 params / refs / subContainers -->
        <EntityDetail :entity="selectedEntity" :get-ref-target-name="getRefTargetName" />
      </div>
    </div>
    <!-- 拖拽调整宽度手柄（左侧边缘） -->
    <div
      class="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-300 active:bg-blue-400 transition-colors z-10"
      @mousedown="onResizeMouseDown"
    ></div>
  </div>
</template>
