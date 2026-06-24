// ============================================================
// 链路追踪器 — 通用范式
//
// 设计:
//   - 递归遍历 entity.refs + subContainers.refs 提取所有引用
//   - 特殊边方向由 SPECIAL_EDGES 配置
//   - 不修改解析器输出的数据，无副作用
// ============================================================

import type { BswMModel, BswMEntity } from '@/types/bswm'
import type { AdjacencyLists } from '@/types/graph'
import { ENTITY_LAYER_MAP, SPECIAL_EDGES } from '@/constants/layers'

/**
 * 递归收集实体及其子容器中所有指向模型内部实体的引用
 *
 * 与 graph-builder.ts 中的同名函数逻辑一致，
 * 提取为共享函数需要引入循环依赖，因此各自保留。
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
 * 从 BswMModel 的引用关系构建双向邻接表
 *
 * 数据流方向: RequestPort → Condition → Expression → Rule → ActionList → Action
 * forward 沿此方向，reverse 逆此方向
 */
export function buildAdjacency(model: BswMModel): AdjacencyLists {
  const forwardSets = new Map<string, Set<string>>()
  const reverseSets = new Map<string, Set<string>>()

  function addEdge(from: string, to: string) {
    let fSet = forwardSets.get(from)
    if (!fSet) { fSet = new Set(); forwardSets.set(from, fSet) }
    fSet.add(to)

    let rSet = reverseSets.get(to)
    if (!rSet) { rSet = new Set(); reverseSets.set(to, rSet) }
    rSet.add(from)
  }

  for (const [path, entity] of model.entities) {
    const specialDefs = SPECIAL_EDGES[entity.type]
    const specialRefSuffixes = specialDefs
      ? new Set(specialDefs.map(d => d.refSuffix))
      : null

    const allRefs = collectAllInternalRefs(entity, model.entities)

    for (const [refSuffix, target] of allRefs) {
      if (specialRefSuffixes?.has(refSuffix)) {
        // 特殊边: 当前实体 → 引用目标（正向）
        addEdge(path, target)
      } else {
        // 普通边: 引用目标 → 当前实体（数据流方向）
        addEdge(target, path)
      }
    }
  }

  // Set → Array
  const forward = new Map<string, string[]>()
  const reverse = new Map<string, string[]>()
  for (const [k, v] of forwardSets) forward.set(k, [...v])
  for (const [k, v] of reverseSets) reverse.set(k, [...v])

  return { forward, reverse }
}

/**
 * 从指定节点出发，BFS 追踪完整链路（前级 + 后级）
 */
export function traceChain(nodePath: string, adjacency: AdjacencyLists): Set<string> {
  const result = new Set<string>()

  // BFS 后级
  const downQueue = [nodePath]
  const downVisited = new Set<string>([nodePath])
  while (downQueue.length > 0) {
    const current = downQueue.shift()!
    result.add(current)
    for (const neighbor of (adjacency.forward.get(current) ?? [])) {
      if (!downVisited.has(neighbor)) {
        downVisited.add(neighbor)
        downQueue.push(neighbor)
      }
    }
  }

  // BFS 前级
  const upQueue = [nodePath]
  const upVisited = new Set<string>([nodePath])
  while (upQueue.length > 0) {
    const current = upQueue.shift()!
    result.add(current)
    for (const neighbor of (adjacency.reverse.get(current) ?? [])) {
      if (!upVisited.has(neighbor)) {
        upVisited.add(neighbor)
        upQueue.push(neighbor)
      }
    }
  }

  return result
}

/**
 * 检测所有未使用节点
 *
 * 定义: 一个节点"已使用" ⟺ 它属于至少一条从 RequestPort 到 Action 的完整链路
 */
export function findUnusedNodes(model: BswMModel, adjacency: AdjacencyLists): Set<string> {
  const allNodes = new Set<string>()
  const requestPortPaths: string[] = []
  const actionPaths: string[] = []

  for (const [path, entity] of model.entities) {
    const layer = ENTITY_LAYER_MAP[entity.type]
    if (!layer) continue
    allNodes.add(path)
    if (layer === 'requestPort') requestPortPaths.push(path)
    if (layer === 'action') actionPaths.push(path)
  }

  // Step 1: 从 Action 出发沿 reverse BFS
  const canReachAction = new Set<string>()
  {
    const queue: string[] = [...actionPaths]
    for (const p of actionPaths) canReachAction.add(p)
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const neighbor of (adjacency.reverse.get(current) ?? [])) {
        if (!canReachAction.has(neighbor)) {
          canReachAction.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
  }

  // Step 2: 从 RequestPort 出发沿 forward BFS
  const canReachFromPort = new Set<string>()
  {
    const queue: string[] = [...requestPortPaths]
    for (const p of requestPortPaths) canReachFromPort.add(p)
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const neighbor of (adjacency.forward.get(current) ?? [])) {
        if (!canReachFromPort.has(neighbor)) {
          canReachFromPort.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
  }

  // Step 3: 未使用 = 全部 - 已使用
  const unusedNodes = new Set<string>()
  for (const path of allNodes) {
    if (!canReachAction.has(path) || !canReachFromPort.has(path)) {
      unusedNodes.add(path)
    }
  }

  return unusedNodes
}
