# BswM Viewer 架构设计文档

## 1. 概述

BswM Viewer 将 AUTOSAR BswM 的 ARXML 配置文件解析为结构化数据模型，再转换为交互式有向图进行可视化展示。核心设计遵循「解析 → 建模 → 构图 → 布局 → 渲染」的单向数据流管道。

项目采用**通用范式**设计：所有 EcuC 容器统一为 `BswMEntity`，层级分类和特殊边语义由声明式配置驱动，新增实体类型无需修改解析器和图构建器。

### 数据流总览

```
ARXML 文件
    ↓
core/parser/arxml-parser.ts  →  BswMModel（单一 entities Map）
    ↓
core/graph/graph-builder.ts  →  Node[] + Edge[]（Vue Flow 格式）
    ↓
core/graph/layout.ts（ELK.js）  →  定位后的 Node[]
    ↓
composables/useGraphFilter.ts  →  过滤/标注后的节点和边
    ↓
Vue Flow 渲染  →  交互式 DAG
```

状态管理由 Pinia store 编排整个管道：`loadArxml()` → `rebuildGraph()` → `useGraphFilter` → Vue Flow 渲染。

## 2. 类型体系

类型定义位于 `src/types/bswm.ts`（纯领域类型）和 `src/types/graph.ts`（图桥接类型），是整个项目的数据契约。

### 核心模型

```
BswMModel
└── entities: Map<string, BswMEntity>    # 所有实体，以 ARXML 路径为键
```

```
BswMEntity
├── name: string                         # SHORT-NAME
├── path: string                         # ARXML 完整路径
├── type: string                         # DEFINITION-REF 最后一段（如 'BswMRule'）
├── params: Map<string, string>          # 自动提取的所有参数
├── refs: Map<string, string[]>          # 自动提取的所有引用（仅容器直接引用）
└── subContainers: BswMEntity[]          # 递归子容器（完整嵌套结构）
```

### 设计要点

- **通用范式** — 所有 EcuC 容器统一为 `BswMEntity`，不再有 `ModeRequestPort`、`BswMRule` 等特定类型。参数和引用通过 Map 自动提取，零信息丢失。新增实体类型只需在 `ENTITY_LAYER_MAP` 中配置，无需修改解析器。
- **Map 键 = ARXML 路径** — 每个实体的 `path` 与 ARXML 中 `VALUE-REF` 的路径完全一致，使得跨引用解析退化为 Map.get() 操作，O(1) 复杂度
- **路径前缀动态提取** — 从 AR-PACKAGE 的 SHORT-NAME 提取 ECU 前缀（如 `/S32K312`），不硬编码任何 ECU 名称
- **6 层枚举** — `NodeLayer` 联合类型（`src/constants/layers.ts`）严格限定 6 种层级，与 `LAYER_PARTITION`、`LAYER_COLORS`、`LAYER_LABEL`、`ENTITY_LAYER_MAP`、`SPECIAL_EDGES` 五个常量表联动，新增层级只需扩展枚举和对应常量
- **声明式配置驱动** — `ENTITY_LAYER_MAP` 决定哪些容器类型被解析为顶层实体（不在映射中的类型不参与图构建），`SPECIAL_EDGES` 决定特殊边的方向、样式和标签
- **递归子容器** — `subContainers` 保留完整的嵌套结构，深层引用（如 ActionList → ActionListItem → Action）通过递归遍历提取

## 3. ARXML 解析器

### 解析策略

文件：`src/core/parser/arxml-parser.ts`

1. **递归搜索** — `findBswmModule()` 递归遍历 AR-PACKAGE 树，找到 SHORT-NAME 为 "BswM" 的 ECUC-MODULE-CONFIGURATION-VALUES
2. **通用容器解析** — `parseContainer(container, path)` 将任何 ECUC-CONTAINER-VALUE 统一解析为 `BswMEntity`：
   - 自动提取所有参数（`getAllParams` → `params` Map）
   - 自动提取所有引用（`REFERENCE-VALUES` → `refs` Map）
   - 递归解析子容器（`getSubContainers` → `subContainers`）
   - 零 if-else 分发，零信息丢失
3. **DEFINITION-REF 识别** — 通过 `defRefLastSegment()` 提取 DEFINITION-REF 路径末尾段作为实体 `type`，用于 `ENTITY_LAYER_MAP` 查找
4. **层级过滤** — 仅 `ENTITY_LAYER_MAP` 中定义的 6 种核心类型被加入 `entities` Map，其余容器不参与图构建
5. **BswMPartition 支持** — 若 BswMConfig 下存在 BswMPartition，则进入 Partition 内部查找 BswMArbitration 和 BswMModeControl

### 解析流程

```
ARXML → XMLParser → 递归搜索 AR-PACKAGE 树 → 找到 BswM 模块
    → 找到 BswMConfig → 找到 BswMArbitration / BswMModeControl
    → (可能穿过 BswMPartition)
    → 对每个子容器: defRefLastSegment ∈ ENTITY_LAYER_MAP?
        → 是: parseContainer() → 加入 entities Map
        → 否: 跳过
```

### 支持的实体类型

由 `ENTITY_LAYER_MAP` 配置：

| DEFINITION-REF 后缀 | NodeLayer | 说明 |
|---------------------|-----------|------|
| BswMModeRequestPort | requestPort | 模式请求端口 |
| BswMEventRequestPort | requestPort | 事件请求端口 |
| BswMModeCondition | condition | 模式条件 |
| BswMLogicalExpression | expression | 逻辑表达式 |
| BswMRule | rule | 仲裁规则 |
| BswMActionList | actionList | 动作列表 |
| BswMAction | action | 动作 |

## 4. 图构建器

文件：`src/core/graph/graph-builder.ts`

### 构建逻辑

`buildGraph(model)` 遍历 `BswMModel.entities`，为每个实体创建一个 Vue Flow 节点，并根据引用关系创建边。

### 节点构建

- 节点层级由 `ENTITY_LAYER_MAP[entity.type]` 推导
- 不在映射中的实体不创建节点
- 节点详情由 `getEntityDetail(entity)` 生成，按实体类型提取最有辨识度的参数

### 边构建

边通过递归遍历 `entity.refs + subContainers.refs` 提取所有引用关系：

1. **普通边** — source=引用目标, target=当前实体（数据流方向：被引用方 → 引用方）
2. **特殊边** — 由 `SPECIAL_EDGES` 配置，source=当前实体 → target=引用目标（正向边）

当前特殊边配置：

| 实体类型 | 引用后缀 | handle | label | styleKey | 说明 |
|---------|---------|--------|-------|----------|------|
| BswMRule | BswMRuleTrueActionList | true | T | true | Rule → True ActionList（绿色动画） |
| BswMRule | BswMRuleFalseActionList | false | F | false | Rule → False ActionList（红色虚线） |
| BswMActionList | BswMActionListItemRef | — | — | default | ActionList → Action（普通边） |

### 节点 ID 策略

节点 ID = 实体的 ARXML 完整路径。这保证了：
- 同一实体在图上只出现一次（即使被多次引用）
- 引用关系天然对应 source/target ID
- 路径可直接用于 Map 查找回源数据

### 边的颜色语义

| 边类型 | 颜色 | 样式 |
|--------|------|------|
| 普通引用 | 深灰蓝 `#546e7a` | 实线 |
| Rule → True ActionList | 深绿 `#2e7d32` | 实线 + 动画 |
| Rule → False ActionList | 深红 `#c62828` | 虚线 |

### 边 ID 去重

格式 `e-{source}[-{handle}]-{target}`，通过 Set 去重，避免同一引用关系重复建边。

### 节点详情生成

`getEntityDetail(entity)` 按实体类型从 `params` 和 `subContainers` 中提取最有辨识度的信息：

| 实体类型 | 详情来源 | 示例 |
|---------|---------|------|
| BswMModeRequestPort / BswMEventRequestPort | 子容器 Source 类型 | GenericRequest |
| BswMModeCondition | BswMConditionType + 比较值 | EQUALS 1 |
| BswMLogicalExpression | BswMLogicalOperator | AND |
| BswMRule | BswMRuleInitState | UNDEFINED |
| BswMActionList | BswMActionListExecution | TRIGGER |
| BswMAction | 子容器 BswMAvailableActions 中的动作类型和参数 | EcuMGoDown |

## 5. 自动布局

文件：`src/core/graph/layout.ts`

### ELK.js 配置

使用 ELK layered 算法（Sugiyama 风格），关键配置：

- **分区约束** — `elk.partition` 将每个节点强制分配到指定列，保证 6 层从左到右排列
- **方向支持** — RIGHT（水平从左到右）和 DOWN（垂直从上到下）
- **正交边路由** — `ORTHOGONAL` 模式，直角折线避免线缆交错
- **交叉最小化** — `LAYER_SWEEP` 策略，50 次扫描
- **节点放置** — `BRANDES_KOEPF` 策略，紧凑排列

### 回退布局

ELK 失败时使用简单的网格布局：按层分列，列内纵向等距排列。

### 构建优化

Vite 配置中通过 `manualChunks` 将 ELK.js（~1.4MB）和 Vue Flow 拆分为独立 chunk，优化缓存策略。

## 6. 链路追踪

文件：`src/core/graph/chain-tracer.ts`

### 邻接表构建

`buildAdjacency(model)` 从 BswMModel 的所有引用关系构建正向/反向邻接表：

- 递归遍历 `entity.refs + subContainers.refs` 收集所有内部引用
- 特殊边方向由 `SPECIAL_EDGES` 配置：
  - 普通引用：被引用方 → 引用方（数据流方向）
  - 特殊引用：当前实体 → 引用目标（正向）
- 一次性构建，后续操作 O(1) 查找

### 链路追踪

`traceChain(nodePath, adjacency)` 从指定节点出发：
1. 沿正向邻接表 BFS 收集后级
2. 沿反向邻接表 BFS 收集前级
3. 合并得到完整链路节点集合

### 未使用节点检测

`findUnusedNodes(model, adjacency)` 检测不属于任何 RequestPort→Action 完整链路的节点：
1. 从 Action 出发沿 reverse BFS → 得到可达 Action 的节点集合
2. 从 RequestPort 出发沿 forward BFS → 得到从 RequestPort 可达的节点集合
3. 未使用 = 全部节点 - (可达Action ∩ 从RequestPort可达)

优势：
- 枚举引用关系只在构建邻接表时做一次，不会遗漏
- BFS 迭代而非递归，无栈溢出风险
- 新增实体类型只需在 `buildAdjacency` 中通过 `collectAllInternalRefs` 自动处理

## 7. 状态管理

文件：`src/stores/bswm-store.ts`

### 状态

| 类别 | 状态 | 类型 | 说明 |
|------|------|------|------|
| 数据 | `model` | `Ref<BswMModel \| null>` | BswMModel 原始数据 |
| 图 | `nodes` | `shallowRef<Node[]>` | Vue Flow 渲染数据（shallowRef 避免深层代理） |
| 图 | `edges` | `shallowRef<Edge[]>` | Vue Flow 渲染数据 |
| UI | `loading` | `Ref<boolean>` | 加载状态 |
| UI | `error` | `Ref<string \| null>` | 错误信息 |
| UI | `selectedNodePath` | `Ref<string \| null>` | 当前选中节点（DetailPanel 显示用） |
| UI | `focusedNodePath` | `Ref<string \| null>` | 当前聚焦节点（链路高亮 + fitView 用） |
| UI | `layoutDirection` | `Ref<'RIGHT' \| 'DOWN'>` | 布局方向 |
| UI | `layerVisibility` | `Ref<Record<NodeLayer, boolean>>` | 各层显隐 |

### 计算属性

| 计算属性 | 说明 |
|---------|------|
| `adjacency` | 双向邻接表（model 变化时重建） |
| `focusedChainIds` | 聚焦节点的完整链路 ID 集合（前级 + 自身 + 后级，BFS 追踪） |
| `unusedNodePaths` | 未使用节点集合（不属于任何 RequestPort→Action 完整链路） |

### 核心操作

- **`loadArxml(content)`** — 解析 ARXML → 存储 model → 重建图 → 重置选择/聚焦状态
- **`rebuildGraph()`** — 从 model 重新构建节点/边 → ELK 布局 → 更新渲染数据（并发安全：版本号 `graphGeneration` 保证只有最后一次调用生效）
- **`focusNode(path)`** — 设置聚焦节点，触发 `focusedChainIds` 重算
- **`clearFocus()`** — 清除聚焦
- **`selectNode(path)`** — 选择节点（DetailPanel 显示用）
- **`toggleLayer(layer)`** — 切换图层可见性

## 8. 组件体系

### 组件关系

```
App.vue
└── BswMGraph.vue
    ├── Sidebar.vue        文件加载 / 图层过滤 / 实体列表导航
    ├── Toolbar.vue        缩放 / 布局方向 / 搜索 / 清除高亮
    ├── VueFlow            图画布
    │   ├── 6 种自定义节点组件（共享 BaseNodeProps 类型）
    │   ├── Background     网格背景
    │   └── Controls       缩放控件
    └── DetailPanel.vue    选中实体详情（递归展示）
        └── EntityDetailRender.ts  递归渲染 render 函数组件
```

### 自定义节点组件

6 个组件位于 `src/components/nodes/`，每个对应一个 `NodeLayer`：

- 统一使用 `BaseNodeProps` 类型（`label`, `detail`, `highlighted`, `dimmed`, `unused`）
- 节点样式通过 CSS 类名（`global.css`）定义，常量颜色（`LAYER_COLORS`）用于侧栏和详情面板
- 支持 `highlighted`（红框高亮）、`dimmed`（降低透明度）、`unused`（灰色角标）三种视觉状态
- **RuleNode** 特殊：有两个 source handle（`true` 和 `false`），对应 Rule 的 True/False 分支
- **ExpressionNode** 特殊：根据逻辑操作符显示数学符号（AND→∧, OR→∨, XOR→⊕ 等）

### 图层过滤 + 链路高亮

逻辑提取到 `useGraphFilter` composable（`src/composables/useGraphFilter.ts`），由 `watchEffect` 驱动：

1. **图层可见性过滤** — 根据 `layerVisibility` 过滤不显示的层
2. **链路高亮** — 当 `focusedChainIds` 有值时，链路内节点标 `highlighted`，链路外标 `dimmed`
3. **未使用标记** — `unusedNodePaths` 中的节点标 `unused`
4. **边过滤** — 仅保留两端节点都可见的边，链路外边降低 opacity

### 详情面板

`DetailPanel.vue` 显示选中实体的字段信息：
- 基本字段：名称、类型、路径
- 使用 `EntityDetail` render 函数组件递归展示 params / refs / subContainers
- 递归渲染使用 render 函数而非 SFC，因为 Vue SFC 模板不支持组件自引用递归

### 搜索功能

`Toolbar.vue` 实现实时搜索，智能排序：
- 完全匹配名称（score 0）→ 名称前缀匹配（score 1）→ 名称包含匹配（score 10+）→ detail 完全匹配（score 100）→ detail 包含匹配（score 200+）
- 最多显示 30 个结果，按得分升序排列

### 侧栏

`Sidebar.vue` 功能：
- 文件加载区：Tauri 原生文件对话框或浏览器 `<input type="file">`，加载示例文件
- 图层过滤区：6 个独立 checkbox 控制各层显隐
- 实体列表区：按 `ENTITY_LAYER_MAP` 分组，点击实体高亮其完整链路，未使用实体标 "⚠未使用"
- 统计信息：各类型实体数量

### 可拖拽面板

侧栏和详情面板均支持拖拽调整宽度，通过 mousedown/mousemove/mouseup 事件实现，拖拽时禁止文本选中。

## 9. 声明式配置系统

`src/constants/layers.ts` 中的声明式配置驱动整个系统的行为，是通用范式的核心：

### ENTITY_LAYER_MAP

决定哪些容器类型被解析为顶层实体，以及它们属于哪个层级：

```typescript
export const ENTITY_LAYER_MAP: Record<string, NodeLayer> = {
  BswMModeRequestPort: 'requestPort',
  BswMEventRequestPort: 'requestPort',
  BswMModeCondition: 'condition',
  BswMLogicalExpression: 'expression',
  BswMRule: 'rule',
  BswMActionList: 'actionList',
  BswMAction: 'action',
}
```

影响范围：
- **解析器** — 仅 ENTITY_LAYER_MAP 中的类型被加入 entities Map
- **图构建器** — 从 ENTITY_LAYER_MAP 推导节点层级
- **链路追踪器** — 使用 ENTITY_LAYER_MAP 识别 RequestPort 和 Action 端点
- **侧栏** — 使用 ENTITY_LAYER_MAP 分组实体列表

### SPECIAL_EDGES

定义特殊边的方向、handle、标签和样式：

```typescript
export const SPECIAL_EDGES: Record<string, SpecialEdgeDef[]> = {
  BswMRule: [
    { refSuffix: 'BswMRuleTrueActionList', handle: 'true', label: 'T', styleKey: 'true' },
    { refSuffix: 'BswMRuleFalseActionList', handle: 'false', label: 'F', styleKey: 'false' },
  ],
  BswMActionList: [
    { refSuffix: 'BswMActionListItemRef', handle: '', label: '', styleKey: 'default' },
  ],
}
```

影响范围：
- **图构建器** — 特殊边 source=当前实体→target=引用目标（正向），普通边反之
- **链路追踪器** — 特殊边的邻接表方向与普通边不同

## 10. 扩展指南

### 添加新的实体类型

通用范式设计下，大多数新实体类型**无需修改解析器**——`parseContainer()` 自动提取所有参数和引用。

1. `src/constants/layers.ts` — `ENTITY_LAYER_MAP` 新增映射
2. 如果需要新的图层层级：
   - `NodeLayer` 新增联合类型成员
   - 更新 `LAYER_PARTITION`、`LAYER_COLORS`、`LAYER_LABEL`
   - `src/components/nodes/` — 新建对应节点组件
   - `src/components/BswMGraph.vue` — `nodeTypes` 注册新组件
3. 如果有特殊边语义 — `SPECIAL_EDGES` 新增配置
4. 如果需要节点详情定制 — `src/core/graph/graph-builder.ts` → `getEntityDetail()` 新增 case

### 添加新的特殊边类型

1. `src/constants/layers.ts` — `SPECIAL_EDGES` 中为对应实体类型添加 `SpecialEdgeDef`
2. 自动生效于图构建器和链路追踪器，无需修改其他代码

### 修改节点样式

节点颜色由两处定义：
- **CSS 样式** 在 `src/styles/global.css` 中定义（如 `.bswm-node-request`）
- **常量颜色** 在 `src/constants/layers.ts` 的 `LAYER_COLORS` 中定义（用于侧栏和详情面板）

### 修改图布局参数

图布局参数在 `src/core/graph/layout.ts` 的 `applyElkLayout` 函数中定义，包括层间距、节点间距、边路由策略等。

## 11. Tauri 后端设计原则

Tauri 仅负责提供 Vue 无法原生实现的功能，所有 UI 逻辑和数据处理都在 Vue 中完成：

| 职责 | 实现层 | 说明 |
|------|--------|------|
| ARXML 解析 | Vue (`core/parser/`) | 纯前端逻辑，使用 fast-xml-parser |
| 图构建与布局 | Vue (`core/graph/`) | 纯前端逻辑，使用 ELK.js |
| 状态管理 | Vue (`stores/`) | Pinia store |
| 示例文件加载 | Vue (`fetch('/sample/BswM.arxml')`) | Vite 的 public/ 机制，Tauri 和浏览器统一 |
| 文件选择 | Vue + Tauri | 浏览器用 `<input type="file">`，Tauri 用原生对话框（更好的 Windows 体验） |
| 文件重读 | Tauri | `read_file` 命令，根据路径重读文件（"重新加载"功能） |
| 打包为 exe | Tauri | Windows NSIS 安装程序 |

Tauri 后端暴露两个命令：
- **`open_file`** — 原生文件对话框，返回文件名、内容和路径
- **`read_file`** — 根据文件路径重新读取内容（无需对话框，用于"重新加载"功能）

不承担任何数据处理或业务逻辑。
