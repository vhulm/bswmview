// ============================================================
// 图层相关常量 — 6 层 DAG 的分区、颜色、标签
// ============================================================

import type { ConditionType } from '@/types/bswm'

/** 节点层级枚举（用于图布局分区） */
export type NodeLayer = 'requestPort' | 'condition' | 'expression' | 'rule' | 'actionList' | 'action'

/** 层级分区编号映射 */
export const LAYER_PARTITION: Record<NodeLayer, string> = {
  requestPort: '0',
  condition: '1',
  expression: '2',
  rule: '3',
  actionList: '4',
  action: '5',
}

/** 层级颜色映射（border 用于 DetailPanel 标题色和侧栏指示条；节点背景/边框色在 global.css 中独立定义） */
export const LAYER_COLORS: Record<NodeLayer, { border: string }> = {
  requestPort: { border: '#2196f3' },
  condition:   { border: '#ff9800' },
  expression:  { border: '#9c27b0' },
  rule:        { border: '#4caf50' },
  actionList:  { border: '#ffc107' },
  action:      { border: '#f44336' },
}

/** 层级中文名 */
export const LAYER_LABEL: Record<NodeLayer, string> = {
  requestPort: '请求端口',
  condition: '模式条件',
  expression: '逻辑表达式',
  rule: '仲裁规则',
  actionList: '动作列表',
  action: '动作',
}

/** 条件类型在 ARXML 中的原始值映射 */
export const CONDITION_TYPE_MAP: Record<string, ConditionType> = {
  BSWM_EQUALS: 'EQUALS',
  BSWM_EQUALS_NOT: 'NOT_EQUALS',
}
