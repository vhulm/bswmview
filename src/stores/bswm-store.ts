// ============================================================
// Pinia 状态管理 — BswM 全局状态
// ============================================================

import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type { BswMModel } from '@/types/bswm'
import type { NodeLayer } from '@/constants/layers'
import { parseBswMArxml, buildGraph, applyElkLayout, buildAdjacency, traceChain, findUnusedNodes } from '@/core'
import type { Node, Edge } from '@vue-flow/core'
import type { BswMNodeData } from '@/types/graph'
import type { AdjacencyLists } from '@/types/graph'

export const useBswMStore = defineStore('bswm', () => {
  // ---- 状态 ----
  const model = ref<BswMModel | null>(null)
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

  /** 未使用节点集合 */
  const unusedNodePaths = computed<Set<string>>(() => {
    if (!model.value || !adjacency.value) return new Set()
    return findUnusedNodes(model.value, adjacency.value)
  })

  // ---- 计算属性 ----

  /** 聚焦节点的完整链路 ID 集合 */
  const focusedChainIds = computed(() => {
    const path = focusedNodePath.value
    const adj = adjacency.value
    if (!path || !adj) return null

    const inGraph = adj.forward.has(path) || adj.reverse.has(path)
    if (!inGraph) return null

    return traceChain(path, adj)
  })

  // ---- 操作 ----

  let graphGeneration = 0

  /** 加载 ARXML 文件 */
  async function loadArxml(content: string) {
    loading.value = true
    error.value = null
    try {
      const parsed = parseBswMArxml(content)
      model.value = parsed
      selectedNodePath.value = null
      focusedNodePath.value = null
      await rebuildGraph()
    } catch (e: any) {
      error.value = e.message ?? '解析失败'
      console.error('[BswM Store] ARXML 解析错误:', e)
      model.value = null
      nodes.value = []
      edges.value = []
    } finally {
      loading.value = false
    }
  }

  /** 重建图 */
  async function rebuildGraph() {
    if (!model.value) return
    const gen = ++graphGeneration
    const { nodes: rawNodes, edges: rawEdges } = buildGraph(model.value)
    const { nodes: laidNodes, edges: laidEdges } = await applyElkLayout(rawNodes, rawEdges, layoutDirection.value)
    if (gen !== graphGeneration) return
    nodes.value = laidNodes
    edges.value = laidEdges
  }

  /** 切换图层可见性 */
  function toggleLayer(layer: NodeLayer) {
    layerVisibility.value[layer] = !layerVisibility.value[layer]
  }

  /** 选择/取消选择节点 */
  function selectNode(path: string | null) {
    selectedNodePath.value = path
  }

  /** 聚焦节点 */
  function focusNode(path: string | null) {
    focusedNodePath.value = path
  }

  /** 清除聚焦 */
  function clearFocus() {
    focusedNodePath.value = null
  }

  return {
    model, nodes, edges, loading, error,
    selectedNodePath, focusedNodePath,
    layerVisibility,
    focusedChainIds, unusedNodePaths,
    loadArxml, toggleLayer,
    selectNode, focusNode, clearFocus, rebuildGraph,
  }
})
