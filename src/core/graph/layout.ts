// ============================================================
// ELK.js 自动布局 — 分区约束确保从左到右6层排列
// ============================================================

import ELK from 'elkjs/lib/elk.bundled.js'
import type { Node, Edge } from '@vue-flow/core'
import type { NodeLayer } from '@/constants/layers'
import { LAYER_PARTITION } from '@/constants/layers'
import type { BswMNodeData } from '@/types/graph'
import { NODE_SIZES } from '@/constants/graph-styles'

const elk = new ELK()

/**
 * 使用 ELK layered 算法布局
 * - 分区约束: 按 LAYER_PARTITION 分6列，从左到右
 * - 方向: RIGHT (水平从左到右)
 */
export async function applyElkLayout(
  nodes: Node<BswMNodeData>[],
  edges: Edge[],
  direction: 'RIGHT' | 'DOWN' = 'RIGHT'
): Promise<{ nodes: Node<BswMNodeData>[], edges: Edge[] }> {

  const elkChildren = nodes.map(node => {
    const layer = (node.data?.layer ?? 'rule') as NodeLayer
    const size = NODE_SIZES[layer] ?? { width: 200, height: 50 }
    const partition = LAYER_PARTITION[layer]

    return {
      id: node.id,
      width: size.width,
      height: size.height,
      layoutOptions: {
        'elk.partition': partition,
      },
    }
  })

  const elkEdges = edges.map(edge => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  }))

  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'RIGHT' ? 'RIGHT' : 'DOWN',

      // 层间距（同类节点之间的水平距离）
      'elk.layered.spacing.nodeNodeBetweenLayers': '140',
      // 同层节点之间的垂直距离
      'elk.spacing.nodeNode': '50',

      // 正交边路由
      'elk.edgeRouting': 'ORTHOGONAL',

      // 交叉最小化
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.sweepNumber': '50',

      // 节点放置策略
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    },
    children: elkChildren,
    edges: elkEdges,
  }

  try {
    const result = await elk.layout(elkGraph)

    // 用 Map 索引 ELK 结果，O(n) 查找替代 O(n²) find
    const elkNodeMap = new Map<string, { x?: number; y?: number }>()
    for (const child of result.children ?? []) {
      elkNodeMap.set(child.id, child)
    }

    const positionedNodes = nodes.map(node => {
      const elkNode = elkNodeMap.get(node.id)
      if (elkNode) {
        return {
          ...node,
          position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
        }
      }
      return node
    })

    return { nodes: positionedNodes, edges }
  } catch (err) {
    console.error('[ELK] 布局失败，使用回退:', err)
    return fallbackLayout(nodes, edges, direction)
  }
}

/** 回退: 按 layer 分列，列内纵向排列。列号直接取自 LAYER_PARTITION（0-5） */
function fallbackLayout(
  nodes: Node<BswMNodeData>[],
  edges: Edge[],
  direction: 'RIGHT' | 'DOWN'
) {
  const rowsInCol = new Map<number, number>()
  const positionedNodes = nodes.map(node => {
    const layer = (node.data?.layer ?? 'rule') as NodeLayer
    const col = Number(LAYER_PARTITION[layer])
    const row = rowsInCol.get(col) ?? 0
    rowsInCol.set(col, row + 1)
    return {
      ...node,
      position: direction === 'RIGHT'
        ? { x: col * 300, y: row * 90 }
        : { x: row * 250, y: col * 120 },
    }
  })
  return { nodes: positionedNodes, edges }
}
