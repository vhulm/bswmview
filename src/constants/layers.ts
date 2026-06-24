// ============================================================
// 图层相关常量 — 声明式配置，驱动通用范式
// ============================================================

/**
 * 节点层级枚举 — BswM DAG 的 6 层结构
 *
 * 只处理 AUTOSAR BswM 规范定义的 6 种核心实体:
 *   请求端口 → 模式条件 → 逻辑表达式 → 仲裁规则 → 动作列表 → 动作
 */
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

/** 层级颜色映射 */
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

/**
 * 实体 → 层级映射 — 决定哪些容器类型被解析为顶层实体
 *
 * key: BswMEntity.type（DEFINITION-REF 最后一段）
 * value: 对应的 NodeLayer
 *
 * 不在此映射中的容器类型不会被加入 entities Map，不参与图构建和渲染
 */
export const ENTITY_LAYER_MAP: Record<string, NodeLayer> = {
  BswMModeRequestPort: 'requestPort',
  BswMEventRequestPort: 'requestPort',
  BswMModeCondition: 'condition',
  BswMLogicalExpression: 'expression',
  BswMRule: 'rule',
  BswMActionList: 'actionList',
  BswMAction: 'action',
}

/**
 * 特殊边配置
 *
 * 某些引用有领域特殊语义，需要：
 *   - 特殊的边方向（正向: 当前实体→引用目标，而非默认的反向）
 *   - 特殊的边样式、handle 和标签
 *
 * key: BswMEntity.type
 * value: 该实体类型中需要特殊处理的引用列表
 *
 * 不在此配置中的引用 → 默认普通边（source=引用目标, target=当前实体，反向）
 */
interface SpecialEdgeDef {
  /** 引用的类型名，如 'BswMRuleTrueActionList' */
  refSuffix: string
  /** Vue Flow sourceHandle，用于区分同一节点的多个输出 */
  handle: string
  /** 边标签，如 'T' / 'F' */
  label: string
  /** 样式键：true=绿色动画，false=红色虚线，default=普通深灰蓝 */
  styleKey: 'true' | 'false' | 'default'
}

export const SPECIAL_EDGES: Record<string, SpecialEdgeDef[]> = {
  BswMRule: [
    { refSuffix: 'BswMRuleTrueActionList', handle: 'true', label: 'T', styleKey: 'true' },
    { refSuffix: 'BswMRuleFalseActionList', handle: 'false', label: 'F', styleKey: 'false' },
  ],
  BswMActionList: [
    { refSuffix: 'BswMActionListItemRef', handle: '', label: '', styleKey: 'default' },
  ],
}
