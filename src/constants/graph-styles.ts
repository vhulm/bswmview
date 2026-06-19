// ============================================================
// 图视觉样式常量 — 边颜色、节点尺寸
// ============================================================

import type { NodeLayer } from '@/constants/layers'

// ---- 边颜色定义 ----

/** 普通引用边: 深灰蓝 */
export const EDGE_DEFAULT_STYLE = { stroke: '#546e7a', strokeWidth: '2' } as const
/** True 分支边: 深绿 */
export const EDGE_TRUE_STYLE = { stroke: '#2e7d32', strokeWidth: '2.5' } as const
/** False 分支边: 深红 */
export const EDGE_FALSE_STYLE = { stroke: '#c62828', strokeWidth: '2.5', strokeDasharray: '6 3' } as const

// ---- 节点尺寸 ----

/** 各层节点默认尺寸 */
export const NODE_SIZES: Record<NodeLayer, { width: number; height: number }> = {
  requestPort: { width: 200, height: 50 },
  condition:   { width: 220, height: 50 },
  expression:  { width: 200, height: 50 },
  rule:        { width: 180, height: 60 },
  actionList:  { width: 220, height: 50 },
  action:      { width: 220, height: 50 },
}
