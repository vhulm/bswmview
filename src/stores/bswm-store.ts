// ============================================================
// Pinia 状态管理 — BswM 全局状态（纯展示，无模拟）
// ============================================================

import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { BswMModel, BswMRule } from '@/types/bswm'
import type { NodeLayer } from '@/constants/layers'
import { parseBswMArxml, buildGraph, applyElkLayout, buildAdjacency, traceChain, findUnusedNodes } from '@/core'
import type { Node, Edge } from '@vue-flow/core'
import type { BswMNodeData } from '@/types/graph'
import type { AdjacencyLists } from '@/types/graph'

export const useBswMStore = defineStore('bswm', () => {
  // ---- 状态 ----
  const model = ref<BswMModel | null>(null)
  // shallowRef 避免 Vue 对节点/边对象深层响应式代理，大幅减少性能开销
  const nodes = shallowRef<Node<BswMNodeData>[]>([])
  const edges = shallowRef<Edge[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedNodePath = ref<string | null>(null)
  /** 当前聚焦的节点路径（用于链路高亮 + fitView） */
  const focusedNodePath = ref<string | null>(null)
  const layoutDirection = ref<'RIGHT' | 'DOWN'>('RIGHT')
  const layerVisibility = ref<Record<NodeLayer, boolean>>({
    requestPort: true,
    condition: true,
    expression: true,
    rule: true,
    actionList: true,
    action: true,
  })

  // ---- 邻接表（随 model 变化重建） ----
  const adjacency = computed<AdjacencyLists | null>(() => {
    if (!model.value) return null
    return buildAdjacency(model.value)
  })

  /** 未使用节点集合（不参与任何 RequestPort→Action 完整链路） */
  const unusedNodePaths = computed<Set<string>>(() => {
    if (!model.value || !adjacency.value) return new Set()
    return findUnusedNodes(model.value, adjacency.value)
  })

  // ---- 计算属性 ----

  /** 带详情的规则列表（侧栏导航用） */
  const rulesWithDetails = computed(() => {
    if (!model.value) return []
    return Array.from(model.value.rules.values()).map((rule: BswMRule) => {
      const expr = model.value!.expressions.get(rule.expressionRef)
      const trueAL = rule.trueActionListRef ? model.value!.actionLists.get(rule.trueActionListRef) : undefined
      const falseAL = rule.falseActionListRef ? model.value!.actionLists.get(rule.falseActionListRef) : undefined
      return {
        name: rule.name,
        path: rule.path,
        initState: rule.initState,
        expressionName: expr?.name ?? '-',
        trueActionListName: trueAL?.name ?? '-',
        falseActionListName: falseAL?.name ?? '-',
      }
    })
  })

  /** 当前选中节点的完整信息（带 _entityType 标记供 UI 使用） */
  const selectedEntity = computed(() => {
    if (!selectedNodePath.value || !model.value) return null
    const path = selectedNodePath.value
    const m = model.value

    // 按层查找，找到后注入 _entityType 标记
    const lookups: [string, Map<string, any>][] = [
      ['requestPort', m.requestPorts],
      ['condition', m.conditions],
      ['expression', m.expressions],
      ['rule', m.rules],
      ['actionList', m.actionLists],
      ['action', m.actions],
      ['modeInitValue', m.modeInitValues],
    ]
    for (const [type, map] of lookups) {
      const entity = map.get(path)
      if (entity) {
        return { ...entity, _entityType: type }
      }
    }
    return null
  })

  /** 聚焦节点的完整链路 ID 集合（前级 + 自身 + 后级，BFS 追踪） */
  const focusedChainIds = computed(() => {
    const path = focusedNodePath.value
    const adj = adjacency.value
    if (!path || !adj) return null

    // 检查节点是否参与邻接关系（在 forward 或 reverse 中有记录）
    // 不参与链路的节点（如 ModeInitValue）不应触发 dimmed 行为
    const inGraph = adj.forward.has(path) || adj.reverse.has(path)
    if (!inGraph) return null

    const ids = traceChain(path, adj)
    return ids.size > 0 ? ids : null
  })

  // ---- 操作 ----

  /** 布局版本号 — 每次重建递增，用于丢弃过期的并发布局结果 */
  let graphGeneration = 0

  /** 加载 ARXML 文件 */
  async function loadArxml(content: string) {
    loading.value = true
    error.value = null
    try {
      const parsed = parseBswMArxml(content)
      model.value = parsed
      // 新文件加载成功，重置旧文件的选择/高亮状态（路径已失效）
      selectedNodePath.value = null
      focusedNodePath.value = null
      await rebuildGraph()
    } catch (e: any) {
      error.value = e.message ?? '解析失败'
      console.error('[BswM Store] ARXML 解析错误:', e)
      // 解析失败时清空旧数据，避免误导
      model.value = null
      nodes.value = []
      edges.value = []
    } finally {
      loading.value = false
    }
  }

  /** 重建图（并发安全：版本号保证只有最后一次调用的结果生效） */
  async function rebuildGraph() {
    if (!model.value) return
    const gen = ++graphGeneration
    const { nodes: rawNodes, edges: rawEdges } = buildGraph(model.value)
    const { nodes: laidNodes, edges: laidEdges } = await applyElkLayout(rawNodes, rawEdges, layoutDirection.value)
    // 丢弃过期结果：如果期间有新的 rebuildGraph 调用，gen 不再等于 graphGeneration
    if (gen !== graphGeneration) return
    nodes.value = laidNodes
    edges.value = laidEdges
  }

  /** 切换布局方向 */
  async function setLayoutDirection(dir: 'RIGHT' | 'DOWN') {
    layoutDirection.value = dir
    await rebuildGraph()
  }

  /** 切换图层可见性 */
  function toggleLayer(layer: NodeLayer) {
    layerVisibility.value[layer] = !layerVisibility.value[layer]
  }

  /** 选择/取消选择节点（DetailPanel 显示用） */
  function selectNode(path: string | null) {
    selectedNodePath.value = path
  }

  /** 聚焦节点（链路高亮 + fitView 用） */
  function focusNode(path: string | null) {
    focusedNodePath.value = path
  }

  /** 清除聚焦 */
  function clearFocus() {
    focusedNodePath.value = null
  }

  return {
    model, nodes, edges, loading, error,
    selectedNodePath, focusedNodePath, layoutDirection,
    layerVisibility,
    rulesWithDetails, selectedEntity, focusedChainIds, unusedNodePaths,
    loadArxml, setLayoutDirection, toggleLayer,
    selectNode, focusNode, clearFocus, rebuildGraph,
  }
})
