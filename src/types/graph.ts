// ============================================================
// 图相关桥接类型 — 连接领域模型与 Vue Flow 渲染层
// ============================================================

import type { NodeLayer } from '@/constants/layers'

/** 领域实体 → Vue Flow 节点的数据桥接类型 */
export interface BswMNodeData extends Record<string, unknown> {
  label: string
  layer: NodeLayer
  path: string
  detail: string
  /** 是否被规则高亮标记 */
  highlighted?: boolean
  [key: string]: unknown
}

/** 双向邻接表（链路追踪用） */
export interface AdjacencyLists {
  /** nodePath → 所有后级节点路径 */
  forward: Map<string, string[]>
  /** nodePath → 所有前级节点路径 */
  reverse: Map<string, string[]>
}
