// ============================================================
// 图构建器 — 通用范式
//
// 核心设计:
//   - 节点: 从 BswMEntity 自动创建，层级由 ENTITY_LAYER_MAP 推导
//   - 边: 递归遍历 entity.refs + subContainers.refs 提取所有引用
//   - 特殊边: 由 SPECIAL_EDGES 配置（Rule True/False、ActionList → Action）
//   - 详情: 从 params/subContainers 通用提取，无 switch 分支
// ============================================================

import type { Node, Edge } from '@vue-flow/core'
import type { BswMModel, BswMEntity } from '@/types/bswm'
import type { NodeLayer } from '@/constants/layers'
import type { BswMNodeData } from '@/types/graph'
import { ENTITY_LAYER_MAP, SPECIAL_EDGES } from '@/constants/layers'
import { EDGE_DEFAULT_STYLE, EDGE_TRUE_STYLE, EDGE_FALSE_STYLE } from '@/constants/graph-styles'

/**
 * 递归收集实体及其子容器中所有指向模型内部实体的引用
 *
 * ARXML 中引用可能出现在容器自身（如 Rule → Expression），
 * 也可能嵌套在子容器中（如 ActionList → ActionListItem → Action）。
 * 此函数递归遍历整棵子容器树，收集所有"内部引用"。
 *
 * @returns (refSuffix, targetPath) 对的列表
 */
function collectAllInternalRefs(entity: BswMEntity, entities: Map<string, BswMEntity>): Array<[string, string]> {
  const results: Array<[string, string]> = []

  function walk(e: BswMEntity) {
    for (const [refSuffix, targets] of e.refs) {
      for (const target of targets) {
        if (entities.has(target)) {
          results.push([refSuffix, target])
        }
      }
    }
    for (const sub of e.subContainers) {
      walk(sub)
    }
  }

  walk(entity)
  return results
}

/**
 * 将 BswMModel 转换为 Vue Flow 节点和边
 */
export function buildGraph(model: BswMModel): { nodes: Node<BswMNodeData>[], edges: Edge[] } {
  const nodes: Node<BswMNodeData>[] = []
  const edges: Edge[] = []
  const edgeIdSet = new Set<string>()

  for (const [path, entity] of model.entities) {
    const layer = ENTITY_LAYER_MAP[entity.type]
    if (!layer) continue // 不在 DAG 层级中的实体不创建节点

    // ---- 创建节点 ----
    nodes.push({
      id: path,
      type: layer,
      position: { x: 0, y: 0 },
      data: {
        label: entity.name,
        layer: layer as NodeLayer,
        path,
        detail: getEntityDetail(entity),
      },
    })

    // ---- 创建边: 遍历所有引用（包括子容器中的） ----
    const specialEdgeDefs = SPECIAL_EDGES[entity.type]

    const allRefs = collectAllInternalRefs(entity, model.entities)

    for (const [refSuffix, target] of allRefs) {
      const specialDef = specialEdgeDefs?.find(d => d.refSuffix === refSuffix)

      if (specialDef) {
        // 特殊边: source=当前实体 → target=引用目标（正向边）
        const edgeStyle = specialDef.styleKey === 'true' ? EDGE_TRUE_STYLE
          : specialDef.styleKey === 'false' ? EDGE_FALSE_STYLE
          : EDGE_DEFAULT_STYLE
        addEdge(edges, edgeIdSet, {
          source: path,
          target,
          sourceHandle: specialDef.handle || undefined,
          label: specialDef.label || undefined,
          animated: specialDef.styleKey === 'true',
          style: edgeStyle,
        })
      } else {
        // 普通边: source=引用目标 → target=当前实体（数据流方向）
        addEdge(edges, edgeIdSet, {
          source: target,
          target: path,
          style: EDGE_DEFAULT_STYLE,
        })
      }
    }
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

/**
 * 生成实体的简短描述（节点第二行文字）
 *
 * 按实体类型提取最有辨识度的参数作为描述
 */
function getEntityDetail(entity: BswMEntity): string {
  switch (entity.type) {
    case 'BswMModeRequestPort':
    case 'BswMEventRequestPort': {
      return getSourceType(entity)
    }
    case 'BswMModeCondition': {
      const condType = entity.params.get('BswMConditionType')?.replace('BSWM_', '') ?? 'EQUALS'
      const value = getConditionValue(entity)
      return value ? `${condType} ${value}` : condType
    }
    case 'BswMLogicalExpression': {
      return entity.params.get('BswMLogicalOperator')?.replace('BSWM_', '') ?? 'AND'
    }
    case 'BswMRule': {
      return entity.params.get('BswMRuleInitState')?.replace('BSWM_', '') ?? 'UNDEFINED'
    }
    case 'BswMActionList': {
      return entity.params.get('BswMActionListExecution')?.replace('BSWM_', '') ?? 'TRIGGER'
    }
    case 'BswMAction': {
      return getActionDetail(entity)
    }
    default:
      return ''
  }
}

/** 从 RequestPort 的子容器中推导来源类型 */
function getSourceType(entity: BswMEntity): string {
  for (const sourceContainer of entity.subContainers) {
    if (!sourceContainer.type.endsWith('Source')) continue
    for (const srcType of sourceContainer.subContainers) {
      if (srcType.type) {
        return srcType.type.replace(/^BswM/, '')
      }
    }
  }
  return ''
}

/** 从 Condition 的子容器中提取比较值 */
function getConditionValue(entity: BswMEntity): string {
  for (const valueContainer of entity.subContainers) {
    if (valueContainer.type !== 'BswMConditionValue') continue
    for (const modeSub of valueContainer.subContainers) {
      if (modeSub.type === 'BswMBswMode') {
        return modeSub.params.get('BswModeCompareValue')
          ?? modeSub.params.get('BswMBswRequestedMode')
          ?? ''
      }
      if (modeSub.type === 'BswMApplicationMode') {
        return modeSub.params.get('BswMApplicationValue') ?? ''
      }
    }
  }
  return ''
}

/** 从 Action 的子容器中提取动作描述 */
function getActionDetail(entity: BswMEntity): string {
  for (const availContainer of entity.subContainers) {
    if (availContainer.type !== 'BswMAvailableActions') continue
    for (const actionSub of availContainer.subContainers) {
      const actionTypeName = actionSub.type.replace(/^BswM/, '')
      const detail = getActionSubDetail(actionSub)
      return detail ? `${actionTypeName}: ${detail}` : actionTypeName
    }
  }
  return entity.type
}

/** 从 Action 子类型容器中提取关键参数值 */
function getActionSubDetail(sub: BswMEntity): string {
  const candidates = [
    'BswMEcuMShutdownTarget',
    'BswMEcuMState',
    'BswMComMRequestedMode',
    'BswMNMAction',
    'BswMNvMBlockControl',
    'BswMPduRouterAction',
    'BswMUserCalloutFunction',
    'BswMComAllowed',
  ]
  for (const key of candidates) {
    const val = sub.params.get(key)
    if (val !== undefined) {
      return val
        .replace(/^BSWM_ECUM_SHUTDOWN_TARGET_/, '')
        .replace(/^BSWM_ECUM_STATE_/, '')
        .replace(/^BSWM_NM_/, '')
        .replace(/^BSWM_PDUR_/, '')
        .replace(/^BSWM_/, '')
        .replace(/^COMM_/, '')
    }
  }
  // 回退: 显示第一个非 index/abortOnFail 参数值
  for (const [key, val] of sub.params) {
    if (key !== 'BswMActionListItemIndex' && key !== 'BswMAbortOnFail') {
      return val.replace(/^BSWM_/, '')
    }
  }
  return ''
}
