// ============================================================
// BswM 数据模型类型定义
// 对应 AUTOSAR BswM 配置的完整层级结构
// ============================================================

/** 模式请求来源类型 */
export type RequestSourceType =
  | 'EcuMIndication'
  | 'EcuMRUNRequestIndication'
  | 'EcuMWakeupSource'
  | 'CanSMIndication'
  | 'ComMIndication'
  | 'ComMPncRequest'
  | 'DcmComModeRequest'
  | 'GenericRequest'
  | 'Timer'

/** 模式请求来源详情 */
export interface ModeRequestSource {
  type: RequestSourceType
  /** EcuMWakeupSource 的唤醒源引用 / CanSMIndication 的通道引用 / ComMIndication 的通道引用 / DcmComModeRequest 的通道引用 */
  reference?: string
  /** GenericRequest 的请求者 ID */
  requesterId?: number
  /** EcuMRUNRequestIndication 的协议端口值 */
  protocolPort?: string
}

/** 模式请求端口 — 输入层 */
export interface ModeRequestPort {
  name: string
  /** 完整 ARXML 路径（用于引用解析） */
  path: string
  processing: 'IMMEDIATE' | 'DEFERRED'
  source: ModeRequestSource
}

/** 条件比较类型 */
export type ConditionType = 'EQUALS' | 'NOT_EQUALS'

/** 模式条件 — 条件层 */
export interface ModeCondition {
  name: string
  path: string
  conditionType: ConditionType
  /** 引用的 ModeRequestPort 路径 */
  modeRequestPortRef: string
  /** 比较值 */
  compareValue: string
  /** 比较值的来源类型: enumeration | string */
  compareValueType: 'enumeration' | 'string'
}

/** 逻辑操作符 */
export type LogicalOperator = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOR' | 'NXOR' | 'NOT'

/** 逻辑表达式 — 逻辑层（可递归嵌套） */
export interface LogicalExpression {
  name: string
  path: string
  operator: LogicalOperator
  /** 引用 ModeCondition 或 LogicalExpression 的路径列表（递归！） */
  arguments: string[]
}

/** 规则初始状态 */
export type RuleInitState = 'UNDEFINED' | 'TRUE' | 'FALSE'

/** 仲裁规则 — 规则层 */
export interface BswMRule {
  name: string
  path: string
  nestedExecutionOnly: boolean
  initState: RuleInitState
  /** 引用 LogicalExpression */
  expressionRef: string
  /** 规则为 True 时执行的 ActionList */
  trueActionListRef?: string
  /** 规则为 False 时执行的 ActionList */
  falseActionListRef?: string
}

/** ActionList 执行模式 */
export type ActionListExecution = 'TRIGGER' | 'CONDITIONAL'

/** ActionList 中的动作项 */
export interface ActionListItem {
  index: number
  abortOnFail: boolean
  /** 引用 Action 或 ActionList 的路径 */
  actionRef: string
}

/** 动作列表 — 动作列表层 */
export interface ActionList {
  name: string
  path: string
  execution: ActionListExecution
  items: ActionListItem[]
}

/** 动作类型 */
export type ActionType =
  | 'EcuMDriverInitList'
  | 'EcuMGoDown'
  | 'EcuMSelectShutdownTarget'
  | 'EcuMStateSwitch'
  | 'ComMAllowCom'
  | 'ComMModeSwitch'
  | 'PduGroupSwitch'
  | 'PduRouterControl'
  | 'DeadlineMonitoringControl'
  | 'NMControl'
  | 'UserCallout'
  | 'RteSwitch'
  | 'SchMModeSwitch'
  | 'NvMBlockJobControl'
  | 'Unknown'

/** 动作 — 动作层 */
export interface BswMAction {
  name: string
  path: string
  type: ActionType
  /** 动作特定参数 */
  details: Record<string, string | boolean | number | string[]>
}

/** 模式初始值 — 初始值层 */
export interface ModeInitValue {
  name: string
  path: string
  /** 各来源类型的初始模式值 */
  values: Record<string, string>
}

/** BswM General 全局配置 */
export interface BswMGeneral {
  canSMEnabled: boolean
  comMEnabled: boolean
  dcmEnabled: boolean
  ecuMEnabled: boolean
  nmEnabled: boolean
  nvMEnabled: boolean
  genericRequestEnabled: boolean
  mainFunctionPeriod: number
  cloneVariableSupport: boolean
  devErrorDetect: boolean
  ethIfEnabled: boolean
  ethSMEnabled: boolean
  frSMEnabled: boolean
  j1939DcmEnabled: boolean
  j1939NmEnabled: boolean
  linSMEnabled: boolean
  linTPEnabled: boolean
  sdControlEnabled: boolean
  sdEnabled: boolean
  versionInfoApi: boolean
}

/** BswM 完整数据模型 */
export interface BswMModel {
  general: BswMGeneral
  requestPorts: Map<string, ModeRequestPort>
  conditions: Map<string, ModeCondition>
  expressions: Map<string, LogicalExpression>
  rules: Map<string, BswMRule>
  actionLists: Map<string, ActionList>
  actions: Map<string, BswMAction>
  modeInitValues: Map<string, ModeInitValue>
}

