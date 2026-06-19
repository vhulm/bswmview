// ============================================================
// 链路追踪器 — 从 BswMModel 构建邻接表，BFS 双向追踪完整链路
//
// 设计思路:
//   1. 从 BswMModel 的所有引用关系构建正向/反向邻接表（一次性开销）
//   2. 选中节点后，沿正向邻接表 BFS 收集所有后级，沿反向邻接表 BFS 收集所有前级
//   3. 合并得到完整链路节点集合
//
// 优势:
//   - 枚举引用关系只在构建邻接表时做一次，不会遗漏
//   - BFS 迭代而非递归，无栈溢出风险
//   - 正向/反向完全独立，不存在共享 visited 截断问题
//   - 新增实体类型只需在 buildAdjacency 中加一行 addEdge
// ============================================================

import type { BswMModel } from '@/types/bswm'
import type { AdjacencyLists } from '@/types/graph'

/**
 * 从 BswMModel 的引用关系构建双向邻接表
 *
 * 数据流方向: RequestPort → Condition → Expression → Rule → ActionList → Action
 * forward 沿此方向，reverse 逆此方向
 */
export function buildAdjacency(model: BswMModel): AdjacencyLists {
  // 构建阶段用 Set 去重（O(1) 查找），最终转为数组供 BFS 遍历
  const forwardSets = new Map<string, Set<string>>()
  const reverseSets = new Map<string, Set<string>>()

  /** 添加一条有向边: from → to */
  function addEdge(from: string, to: string) {
    let fSet = forwardSets.get(from)
    if (!fSet) { fSet = new Set(); forwardSets.set(from, fSet) }
    fSet.add(to)

    let rSet = reverseSets.get(to)
    if (!rSet) { rSet = new Set(); reverseSets.set(to, rSet) }
    rSet.add(from)
  }

  // ---- 1. RequestPort → Condition ----
  for (const [path, cond] of model.conditions) {
    if (cond.modeRequestPortRef) {
      addEdge(cond.modeRequestPortRef, path)
    }
  }

  // ---- 2. Condition/Expression → Expression (通过 arguments) ----
  // Expression.arguments 可以引用 Condition 或嵌套 Expression
  for (const [path, expr] of model.expressions) {
    for (const argRef of expr.arguments) {
      addEdge(argRef, path)
    }
  }

  // ---- 3. Expression → Rule (通过 expressionRef) ----
  for (const [path, rule] of model.rules) {
    if (rule.expressionRef) {
      addEdge(rule.expressionRef, path)
    }
  }

  // ---- 4. Rule → ActionList (true/false 分支) ----
  for (const [path, rule] of model.rules) {
    if (rule.trueActionListRef) addEdge(path, rule.trueActionListRef)
    if (rule.falseActionListRef) addEdge(path, rule.falseActionListRef)
  }

  // ---- 5. ActionList → Action/嵌套 ActionList (通过 items) ----
  for (const [path, al] of model.actionLists) {
    for (const item of al.items) {
      if (item.actionRef) addEdge(path, item.actionRef)
    }
  }

  // Set → Array：BFS 遍历用数组，内存更紧凑
  const forward = new Map<string, string[]>()
  const reverse = new Map<string, string[]>()
  for (const [k, v] of forwardSets) forward.set(k, [...v])
  for (const [k, v] of reverseSets) reverse.set(k, [...v])

  return { forward, reverse }
}

/**
 * 从指定节点出发，BFS 追踪完整链路（前级 + 后级）
 *
 * @param nodePath 起始节点路径
 * @param adjacency 邻接表（由 buildAdjacency 构建）
 * @returns 链路中所有节点的路径集合
 */
export function traceChain(nodePath: string, adjacency: AdjacencyLists): Set<string> {
  const result = new Set<string>()

  // ---- BFS 后级（沿 forward 方向） ----
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

  // ---- BFS 前级（沿 reverse 方向） ----
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

// ============================================================
// 未使用节点检测
//
// 定义：一个节点"已使用" ⟺ 它属于至少一条从 RequestPort 到 Action 的完整链路
// 判定：从该节点沿 reverse BFS 能到达某个 RequestPort，
//       且沿 forward BFS 能到达某个 Action
//
// 算法：
//   1. 从所有 RequestPort 出发，沿 forward BFS 标记所有"可达输出"的节点（canReachOutput）
//   2. 从所有 Action 出发，沿 reverse BFS 标记所有"可达输入"的节点（canReachInput）
//   3. canReachOutput ∩ canReachInput = 已使用节点集合
//   4. 其余节点为未使用
// ============================================================

/**
 * 检测所有未使用节点
 *
 * @param model BswM 数据模型
 * @param adjacency 邻接表
 * @returns 未使用节点的路径集合
 */
export function findUnusedNodes(model: BswMModel, adjacency: AdjacencyLists): Set<string> {
  // ---- 所有参与链路分析的节点集合 ----
  // 注意：ModeInitValue 不在 6 层 DAG 中，不参与数据流链路，故不纳入分析
  const allNodes = new Set<string>()
  for (const path of model.requestPorts.keys()) allNodes.add(path)
  for (const path of model.conditions.keys()) allNodes.add(path)
  for (const path of model.expressions.keys()) allNodes.add(path)
  for (const path of model.rules.keys()) allNodes.add(path)
  for (const path of model.actionLists.keys()) allNodes.add(path)
  for (const path of model.actions.keys()) allNodes.add(path)

  // ---- Step 1: 从 RequestPort 出发，沿 forward BFS 标记所有能到达 Action 的节点 ----
  // 先找出哪些节点能直接/间接到达 Action
  const canReachAction = new Set<string>()
  // 反向思考：从 Action 出发沿 reverse BFS，能到达的节点 = 能到达 Action 的节点
  {
    const queue: string[] = []
    for (const path of model.actions.keys()) {
      canReachAction.add(path)
      queue.push(path)
    }
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

  // ---- Step 2: 从 Action 出发，沿 reverse BFS 标记所有能到达 RequestPort 的节点 ----
  // 反向思考：从 RequestPort 出发沿 forward BFS，能到达的节点 = 能从 RequestPort 到达的节点
  const canReachFromPort = new Set<string>()
  {
    const queue: string[] = []
    for (const path of model.requestPorts.keys()) {
      canReachFromPort.add(path)
      queue.push(path)
    }
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

  // ---- Step 3: 同时满足两个条件的节点 = 已使用 ----
  const usedNodes = new Set<string>()
  for (const path of allNodes) {
    if (canReachAction.has(path) && canReachFromPort.has(path)) {
      usedNodes.add(path)
    }
  }

  // ---- Step 4: 未使用 = 全部 - 已使用 ----
  const unusedNodes = new Set<string>()
  for (const path of allNodes) {
    if (!usedNodes.has(path)) {
      unusedNodes.add(path)
    }
  }

  return unusedNodes
}
