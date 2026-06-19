# BswM Viewer 架构设计文档

## 1. 概述

BswM Viewer 将 AUTOSAR BswM 的 ARXML 配置文件解析为结构化数据模型，再转换为交互式有向图进行可视化展示。核心设计遵循「解析 → 建模 → 构图 → 布局 → 渲染」的单向数据流管道。

### 数据流总览

```
ARXML 文件
    ↓
core/parser/arxml-parser.ts  →  BswMModel（7 个 Map 集合）
    ↓
core/graph/graph-builder.ts  →  Node[] + Edge[]（Vue Flow 格式）
    ↓
core/graph/layout.ts（ELK.js）  →  定位后的 Node[]
    ↓
Vue Flow 渲染  →  交互式 DAG
```

状态管理由 Pinia store 编排整个管道：`loadArxml()` → `rebuildGraph()` → Vue Flow 渲染。

## 2. 类型体系

类型定义位于 `src/types/bswm.ts`（纯领域类型）和 `src/types/graph.ts`（图桥接类型），是整个项目的数据契约。

### 核心模型

```
BswMModel
├── general: BswMGeneral              # 全局开关（20 个布尔参数 + 周期）
├── requestPorts: Map<string, ModeRequestPort>
├── conditions: Map<string, ModeCondition>
├── expressions: Map<string, LogicalExpression>
├── rules: Map<string, BswMRule>
├── actionLists: Map<string, ActionList>
├── actions: Map<string, BswMAction>
└── modeInitValues: Map<string, ModeInitValue>
```

### 设计要点

- **Map 键 = ARXML 路径** — 每个实体的 `path` 与 ARXML 中 `VALUE-REF` 的路径完全一致，使得跨引用解析退化为 Map.get() 操作，O(1) 复杂度
- **路径前缀动态提取** — 从 AR-PACKAGE 的 SHORT-NAME 提取 ECU 前缀（如 `/S32K312`），不硬编码任何 ECU 名称
- **6 层枚举** — `NodeLayer` 联合类型（`src/constants/layers.ts`）严格限定 6 种层级，与 `LAYER_PARTITION`、`LAYER_COLORS`、`LAYER_LABEL` 三个常量表联动，新增层级只需扩展枚举和对应常量
- **颜色单点维护** — `LAYER_COLORS` 同时定义 `border`（边框色）和 `bg`（背景色），节点组件通过 `:style` 绑定注入颜色，不再依赖 CSS 类名硬编码

## 3. ARXML 解析器

### 解析策略

文件：`src/core/parser/arxml-parser.ts`

1. **递归搜索** — `findBswmModule()` 递归遍历 AR-PACKAGE 树，找到 SHORT-NAME 为 "BswM" 的 ECUC-MODULE-CONFIGURATION-VALUES
2. **DEFINITION-REF 识别** — 通过 `DEFINITION-REF` 路径末尾段识别容器类型（如 `endsWith('BswMRule')`），而非依赖 SHORT-NAME
3. **参数/引用提取** — `findParamValue(container, suffix)` 和 `findRefValue(container, suffix)` 按 DEFINITION-REF 后缀匹配提取值，兼容不同深度的路径
4. **数组规范化** — `getAllParams(container)` 统一处理 XML 解析后单元素/数组的差异，被 `findParamValue` 和 `parseModeInitValue` 复用
5. **BswMPartition 支持** — 若 BswMConfig 下存在 BswMPartition，则进入 Partition 内部查找 BswMArbitration 和 BswMModeControl

### 请求端口来源类型

9 种来源类型，每种有不同的属性组合：

| 类型 | 枚举参数 | 引用 | 整数参数 |
|------|---------|------|---------|
| EcuMIndication | — | — | — |
| EcuMRUNRequestIndication | protocolPort | — | — |
| EcuMWakeupSource | — | BswMEcuMWakeupSrcRef | — |
| CanSMIndication | — | BswMCanSMChannelRef | — |
| ComMIndication | — | BswMComMChannelRef | — |
| ComMPncRequest | — | BswMComMPncChannelRef | — |
| DcmComModeRequest | — | BswMDcmComMChannelRef | — |
| GenericRequest | — | — | BswMModeRequesterId |
| Timer | — | — | — |

### 动作类型

14 种已识别动作 + 1 个 fallback（Unknown）：

| 类型 | 参数 | 引用 |
|------|------|------|
| EcuMDriverInitList | — | initListRef |
| EcuMGoDown | — | userIdRef |
| EcuMSelectShutdownTarget | shutdownTarget | sleepModeRef |
| EcuMStateSwitch | ecuMState | — |
| ComMAllowCom | comAllowed | channelRef |
| ComMModeSwitch | requestedMode | userRef |
| PduGroupSwitch | reinit | enabledPduGroupRef, disabledPduGroupRef |
| PduRouterControl | pduRouterAction, disableInitBuffer | routingPathGroupRef |
| DeadlineMonitoringControl | — | enabledDMPduGroupRef, disabledDMPduGroupRef |
| NMControl | nmAction | networkHandleRef |
| UserCallout | calloutFunction | — |
| RteSwitch | — | rteModeGroupRef |
| SchMModeSwitch | — | schMModeGroupRef |
| NvMBlockJobControl | nvmBlockControl | — |

未识别的动作类型走 fallback：保留 DEFINITION-REF 最后一段作为类型名，参数以 key-value 形式保存在 `details` 中。

### 条件类型映射

ARXML 中的枚举值与内部类型通过 `CONDITION_TYPE_MAP` 显式映射，避免字符串 replace 推断的脆弱性：

```typescript
{ BSWM_EQUALS: 'EQUALS', BSWM_EQUALS_NOT: 'NOT_EQUALS' }
```

## 4. 图构建器

文件：`src/core/graph/graph-builder.ts`

### 构建逻辑

`buildGraph(model)` 遍历 BswMModel 的 7 个集合，为每个实体创建一个 Vue Flow 节点，并根据引用关系创建边。

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

## 5. 自动布局

文件：`src/core/graph/layout.ts`

### ELK.js 配置

使用 ELK layered 算法（Sugiyama 风格），关键配置：

- **分区约束** — `elk.partition` 将每个节点强制分配到指定列，保证 6 层从左到右排列
- **正交边路由** — `ORTHOGONAL` 模式，直角折线避免线缆交错
- **交叉最小化** — `LAYER_SWEEP` 策略，50 次扫描
- **节点放置** — `BRANDES_KOEPF` 策略，紧凑排列

### 回退布局

ELK 失败时使用简单的网格布局：按层分列，列内纵向等距排列。

## 6. 状态管理

文件：`src/stores/bswm-store.ts`

### 状态

| 类别 | 状态 | 说明 |
|------|------|------|
| 数据 | `model` | BswMModel 原始数据 |
| 图 | `nodes`, `edges` | Vue Flow 渲染数据（shallowRef 避免深层代理） |
| UI | `selectedNodePath` | 当前选中节点（DetailPanel 显示用） |
| UI | `focusedNodePath` | 当前聚焦节点（链路高亮 + fitView 用） |
| UI | `layoutDirection` | RIGHT / DOWN |
| UI | `layerVisibility` | 各层显隐 |

### 计算属性

| 计算属性 | 说明 |
|---------|------|
| `adjacency` | 双向邻接表（model 变化时重建） |
| `focusedChainIds` | 聚焦节点的完整链路 ID 集合（前级 + 自身 + 后级，BFS 追踪） |
| `unusedNodePaths` | 未使用节点集合（不参与任何 RequestPort→Action 完整链路） |
| `rulesWithDetails` | 带详情的规则列表（侧栏导航用） |
| `selectedEntity` | 当前选中节点的完整信息（带 `_entityType` 标记） |

### 核心操作

- **`loadArxml(content)`** — 解析 ARXML → 存储 model → 重建图 → 重置选择/聚焦状态
- **`rebuildGraph()`** — 从 model 重新构建节点/边 → ELK 布局 → 更新渲染数据（并发安全：版本号保证只有最后一次调用生效）
- **`focusNode(path)`** — 设置聚焦节点，触发 `focusedChainIds` 重算
- **`clearFocus()`** — 清除聚焦
- **`selectNode(path)`** — 选择节点（DetailPanel 显示用）

### 链路追踪机制

文件：`src/core/graph/chain-tracer.ts`

1. **`buildAdjacency(model)`** — 从 BswMModel 的所有引用关系构建正向/反向邻接表（一次性开销）
2. **`traceChain(nodePath, adjacency)`** — 从指定节点出发，沿正向邻接表 BFS 收集后级，沿反向邻接表 BFS 收集前级，合并得到完整链路节点集合
3. **`findUnusedNodes(model, adjacency)`** — 从 RequestPort 沿 forward BFS + 从 Action 沿 reverse BFS，交集为已使用节点，差集为未使用

优势：
- 枚举引用关系只在构建邻接表时做一次，不会遗漏
- BFS 迭代而非递归，无栈溢出风险
- 新增实体类型只需在 `buildAdjacency` 中加一行 `addEdge`

## 7. 组件体系

### 组件关系

```
App.vue
└── BswMGraph.vue
    ├── Sidebar.vue        文件加载 / 图层过滤 / 实体列表
    ├── Toolbar.vue        缩放 / 布局方向 / 搜索
    ├── VueFlow            图画布
    │   ├── 6 种自定义节点组件（薄包装 BaseNode.vue）
    │   ├── Background     网格背景
    │   └── Controls       缩放控件
    └── DetailPanel.vue    选中实体详情
```

### 自定义节点组件

6 个组件位于 `src/components/nodes/`，每个对应一个 `NodeLayer`：

- 统一使用 `BaseNode.vue` 通用组件，通过 props 传入 `borderColor`、`bgColor`、`icon`、`detailPrefix`、`handles`
- `BaseNodeProps` 类型定义渲染所需字段（`label`, `detail`, `highlighted`, `dimmed`, `unused`）
- 颜色通过 `LAYER_COLORS` 常量 + `:style` 绑定注入，不再依赖 CSS 类名硬编码
- 支持 `highlighted`、`dimmed`、`unused` 状态控制高亮、变暗、未使用标记

### 图层过滤 + 链路高亮

逻辑提取到 `useGraphFilter` composable（`src/composables/useGraphFilter.ts`），由 `watchEffect` 驱动：

1. **图层可见性过滤** — 根据 `layerVisibility` 过滤不显示的层
2. **链路高亮** — 当 `focusedChainIds` 有值时，链路内节点标 `highlighted`，链路外标 `dimmed`
3. **未使用标记** — `unusedNodePaths` 中的节点标 `unused`
4. **边过滤** — 仅保留两端节点都可见的边，链路外边降低 opacity

## 8. 扩展指南

### 添加新的请求端口来源类型

1. `src/types/bswm.ts` — `RequestSourceType` 新增联合类型成员，`ModeRequestSource` 新增字段
2. `src/core/parser/arxml-parser.ts` — `parseRequestPort` 新增 if-else 分支
3. `src/components/DetailPanel.vue` — RequestPort 显示区新增字段

### 添加新的动作类型

1. `src/types/bswm.ts` — `ActionType` 新增联合类型成员
2. `src/core/parser/arxml-parser.ts` — `parseAction` 新增 if-else 分支
3. `src/core/graph/graph-builder.ts` — `getActionDetailStr` 新增 case

### 添加新的图层

1. `src/constants/layers.ts` — `NodeLayer` 新增成员，更新 `LAYER_PARTITION`、`LAYER_COLORS`、`LAYER_LABEL`
2. `src/components/nodes/` — 新建对应节点组件（薄包装 BaseNode.vue）
3. `src/core/graph/graph-builder.ts` — 建图逻辑中新增节点类型映射
4. `src/components/BswMGraph.vue` — `nodeTypes` 注册新组件

## 9. Tauri 后端设计原则

Tauri 仅负责提供 Vue 无法原生实现的功能，所有 UI 逻辑和数据处理都在 Vue 中完成：

| 职责 | 实现层 | 说明 |
|------|--------|------|
| ARXML 解析 | Vue (`core/parser/`) | 纯前端逻辑，使用 fast-xml-parser |
| 图构建与布局 | Vue (`core/graph/`) | 纯前端逻辑，使用 ELK.js |
| 状态管理 | Vue (`stores/`) | Pinia store |
| 示例文件加载 | Vue (`fetch('/sample/BswM.arxml')`) | Vite 的 public/ 机制，Tauri 和浏览器统一 |
| 文件选择 | Vue + Tauri | 浏览器用 `<input type="file">`，Tauri 用原生对话框（更好的 Windows 体验） |
| 打包为 exe | Tauri | Windows NSIS 安装程序，仅支持 Windows 平台 |

Tauri 后端仅暴露一个命令：`open_file`（原生文件对话框）。不承担任何数据处理或业务逻辑。
