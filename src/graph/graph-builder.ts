// ============================================================
// 图构建器 — 将 BswMModel 转换为 Vue Flow 节点和边
// 数据流方向: RequestPort → Condition → Expression → Rule → ActionList → Action
//
// 核心原则:
//   - 同一个实体在图上只出现一次，被多次引用时通过多条边连接
//   - 所有边使用深色醒目颜色
//   - Rule → ActionList 分 True/False 两种颜色
// ============================================================

import type { Node, Edge } from '@vue-flow/core'
import type { BswMModel, NodeLayer } from '@/types/bswm'

/** 节点数据类型 */
export interface BswMNodeData extends Record<string, unknown> {
  label: string
  layer: NodeLayer
  path: string
  detail: string
  /** 是否被规则高亮标记 */
  highlighted?: boolean
  [key: string]: unknown
}

// ---- 边颜色定义 ----
/** 普通引用边: 深灰蓝 */
const EDGE_DEFAULT_STYLE = { stroke: '#546e7a', strokeWidth: '2' } as const
/** True 分支边: 深绿 */
const EDGE_TRUE_STYLE = { stroke: '#2e7d32', strokeWidth: '2.5' } as const
/** False 分支边: 深红 */
const EDGE_FALSE_STYLE = { stroke: '#c62828', strokeWidth: '2.5', strokeDasharray: '6 3' } as const

/**
 * 将 BswMModel 转换为 Vue Flow 节点和边
 */
export function buildGraph(model: BswMModel): { nodes: Node<BswMNodeData>[], edges: Edge[] } {
  const nodes: Node<BswMNodeData>[] = []
  const edges: Edge[] = []
  const edgeIdSet = new Set<string>()

  // ---- 1. RequestPort 节点 ----
  for (const [path, port] of model.requestPorts) {
    nodes.push({
      id: path,
      type: 'requestPort',
      position: { x: 0, y: 0 },
      data: {
        label: port.name,
        layer: 'requestPort' as NodeLayer,
        path,
        detail: port.source.type,
      },
    })
  }

  // ---- 2. Condition 节点 + RequestPort → Condition 边 ----
  for (const [path, cond] of model.conditions) {
    nodes.push({
      id: path,
      type: 'condition',
      position: { x: 0, y: 0 },
      data: {
        label: cond.name,
        layer: 'condition' as NodeLayer,
        path,
        detail: `${cond.conditionType} ${cond.compareValue}`,
      },
    })

    if (cond.modeRequestPortRef && model.requestPorts.has(cond.modeRequestPortRef)) {
      addEdge(edges, edgeIdSet, {
        source: cond.modeRequestPortRef,
        target: path,
        style: EDGE_DEFAULT_STYLE,
      })
    }
  }

  // ---- 3. Expression 节点 + 参数 → Expression 边 ----
  for (const [path, expr] of model.expressions) {
    nodes.push({
      id: path,
      type: 'expression',
      position: { x: 0, y: 0 },
      data: {
        label: expr.name,
        layer: 'expression' as NodeLayer,
        path,
        detail: expr.operator,
      },
    })

    for (const argRef of expr.arguments) {
      if (model.conditions.has(argRef) || model.expressions.has(argRef)) {
        addEdge(edges, edgeIdSet, {
          source: argRef,
          target: path,
          style: EDGE_DEFAULT_STYLE,
        })
      }
    }
  }

  // ---- 4. Rule 节点 + Expression → Rule 边 + Rule → ActionList 边 ----
  for (const [path, rule] of model.rules) {
    nodes.push({
      id: path,
      type: 'rule',
      position: { x: 0, y: 0 },
      data: {
        label: rule.name,
        layer: 'rule' as NodeLayer,
        path,
        detail: rule.initState,
      },
    })

    // Expression → Rule
    if (rule.expressionRef && model.expressions.has(rule.expressionRef)) {
      addEdge(edges, edgeIdSet, {
        source: rule.expressionRef,
        target: path,
        style: EDGE_DEFAULT_STYLE,
      })
    }

    // Rule → TrueActionList
    if (rule.trueActionListRef && model.actionLists.has(rule.trueActionListRef)) {
      addEdge(edges, edgeIdSet, {
        source: path,
        target: rule.trueActionListRef,
        sourceHandle: 'true',
        label: 'T',
        animated: true,
        style: EDGE_TRUE_STYLE,
      })
    }

    // Rule → FalseActionList
    if (rule.falseActionListRef && model.actionLists.has(rule.falseActionListRef)) {
      addEdge(edges, edgeIdSet, {
        source: path,
        target: rule.falseActionListRef,
        sourceHandle: 'false',
        label: 'F',
        animated: false,
        style: EDGE_FALSE_STYLE,
      })
    }
  }

  // ---- 5. ActionList 节点 + ActionList → Action 边 ----
  for (const [path, al] of model.actionLists) {
    nodes.push({
      id: path,
      type: 'actionList',
      position: { x: 0, y: 0 },
      data: {
        label: al.name,
        layer: 'actionList' as NodeLayer,
        path,
        detail: al.execution,
      },
    })

    for (const item of al.items) {
      if (model.actions.has(item.actionRef) || model.actionLists.has(item.actionRef)) {
        addEdge(edges, edgeIdSet, {
          source: path,
          target: item.actionRef,
          style: EDGE_DEFAULT_STYLE,
        })
      }
    }
  }

  // ---- 6. Action 节点 ----
  for (const [path, action] of model.actions) {
    nodes.push({
      id: path,
      type: 'action',
      position: { x: 0, y: 0 },
      data: {
        label: action.name,
        layer: 'action' as NodeLayer,
        path,
        detail: getActionDetailStr(action),
      },
    })
  }

  return { nodes, edges }
}

/** 添加边（自动生成唯一 id，去重） */
function addEdge(
  edges: Edge[],
  seen: Set<string>,
  opts: { source: string; target: string; style: Record<string, string>; sourceHandle?: string; label?: string; animated?: boolean }
) {
  const handleSuffix = opts.sourceHandle ? `-${opts.sourceHandle}` : ''
  const id = `e-${opts.source}${handleSuffix}-${opts.target}`
  if (seen.has(id)) return
  seen.add(id)

  edges.push({
    id,
    source: opts.source,
    target: opts.target,
    sourceHandle: opts.sourceHandle,
    type: 'default',
    label: opts.label,
    animated: opts.animated ?? false,
    style: opts.style,
  })
}

/** 生成 Action 的简短描述 */
function getActionDetailStr(action: { type: string; details: Record<string, any> }): string {
  switch (action.type) {
    case 'EcuMDriverInitList': return 'EcuM InitList'
    case 'EcuMGoDown': return 'EcuM GoDown'
    case 'EcuMSelectShutdownTarget': return `Shutdown → ${String(action.details.shutdownTarget ?? '').replace('BSWM_ECUM_SHUTDOWN_TARGET_', '')}`
    case 'EcuMStateSwitch': return `State → ${String(action.details.ecuMState ?? '').replace('BSWM_ECUM_STATE_', '')}`
    case 'ComMAllowCom': return action.details.comAllowed ? 'ComM Allow' : 'ComM DisAllow'
    case 'ComMModeSwitch': return `ComM → ${String(action.details.requestedMode ?? '').replace('COMM_', '')}`
    case 'PduGroupSwitch': return action.details.reinit ? 'PduGroup Reinit' : 'PduGroup Switch'
    case 'PduRouterControl': return `PduR ${String(action.details.pduRouterAction ?? '').replace('BSWM_PDUR_', '')}`
    case 'DeadlineMonitoringControl': return 'DM Control'
    case 'NMControl': return action.details.nmAction === 'BSWM_NM_ENABLE' ? 'NM Enable' : 'NM Disable'
    case 'UserCallout': return `Callout: ${action.details.calloutFunction ?? ''}`
    case 'RteSwitch': return 'Rte Switch'
    case 'SchMModeSwitch': return 'SchM Switch'
    case 'NvMBlockJobControl': return `NvM ${action.details.nvmBlockControl ?? ''}`
    case 'Unknown': return 'Unknown Action'
    default: return action.type
  }
}
