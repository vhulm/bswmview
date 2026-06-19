// ============================================================
// 节点组件共享 Props 类型
//
// 此类型覆盖 BswMNodeData（src/types/graph.ts）中的渲染字段
// 以及 BswMGraph.vue watchEffect 中动态标注的状态字段。
// 新增字段时需同步确认 BswMNodeData 的 [key: string]: unknown
// 索引签名兼容。
// ============================================================

/** 所有自定义节点组件的 data prop 统一类型 */
export interface BaseNodeProps {
  label: string
  detail: string
  /** 是否被链路高亮标记（由 BswMGraph.vue watchEffect 设置） */
  highlighted?: boolean
  /** 是否因不在链路内而变暗（由 BswMGraph.vue watchEffect 设置） */
  dimmed?: boolean
  /** 是否为未使用节点（由 BswMGraph.vue watchEffect 设置） */
  unused?: boolean
}
