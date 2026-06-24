# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

BswM Viewer — AUTOSAR BswM（基础软件模式管理器）配置可视化工具。解析 AUTOSAR ARXML 文件，将 BswM 仲裁逻辑渲染为交互式有向图（6 层 DAG）。采用通用范式设计：所有 EcuC 容器统一为 `BswMEntity`，层级分类和特殊边语义由声明式配置驱动，新增实体类型无需修改解析器。

## 常用命令

- `npm run dev` — 启动 Vite 开发服务器
- `npm run build:web` — Web 版本构建（先用 `vue-tsc -b` 类型检查，再用 Vite 构建）
- `npm run build` — Tauri 桌面应用构建
- `npm run preview` — 本地预览 Web 构建结果
- 未配置测试运行器

## 技术栈

- Vue 3（组合式 API + `<script setup>`）+ TypeScript + Vite
- **Vue Flow** (`@vue-flow/core`) — 图渲染
- **ELK.js** — 自动图布局（分层算法 + 分区约束）
- **fast-xml-parser** — ARXML 解析
- **Pinia** — 状态管理
- **Tailwind CSS 4** — 样式（通过 `@tailwindcss/vite` 插件集成，CSS-first 配置）
- **Tauri 2** — 桌面打包 + 原生文件对话框

## 架构与数据流

```
ARXML 文件 → core/parser/arxml-parser.ts → BswMModel → core/graph/graph-builder.ts → Vue Flow 节点/边 → core/graph/layout.ts (ELK) → 渲染图
```

流程由 Pinia store (`bswm-store.ts`) 编排：
1. `loadArxml(content)` 调用 `parseBswMArxml()` → 存储 `BswMModel`
2. `rebuildGraph()` 调用 `buildGraph()` → 原始节点/边，再调用 `applyElkLayout()` → 定位后的节点
3. Vue Flow 渲染定位后的图
4. `useGraphFilter` composable 根据图层可见性、链路高亮、未使用标记过滤/标注节点和边

### 核心数据结构

**`BswMModel`**（`src/types/bswm.ts`）— 核心领域模型，通用范式：
- `entities: Map<string, BswMEntity>` — 单一 Map，以 ARXML 路径为键
- 路径与 ARXML `VALUE-REF` 一致，跨引用通过 Map 直接查找

**`BswMEntity`** — 通用实体类型，所有 EcuC 容器统一为此结构：
- `name` — SHORT-NAME
- `path` — ARXML 完整路径
- `type` — DEFINITION-REF 最后一段（如 `BswMRule`）
- `params: Map<string, string>` — 所有参数（自动提取）
- `refs: Map<string, string[]>` — 所有引用（自动提取，仅容器直接引用）
- `subContainers: BswMEntity[]` — 子容器（递归，完整嵌套结构）

**6 层 DAG** — 节点从左到右流经以下层（由 ELK `elk.partition` 约束，`constants/layers.ts` 定义分区编号）：
1. RequestPort（输入）→ 2. Condition（比较）→ 3. Expression（逻辑）→ 4. Rule（仲裁）→ 5. ActionList → 6. Action（输出）

**声明式配置** — 驱动层级分类和特殊边语义：
- `ENTITY_LAYER_MAP` — 实体类型 → 层级映射（决定哪些类型被解析为顶层实体）
- `SPECIAL_EDGES` — 特殊边配置（Rule True/False、ActionList→Action）

### 模块职责

**核心模块**（`src/core/`）：
- **`core/parser/arxml-parser.ts`** — 将 ARXML 解析为 `BswMModel`。通用范式：所有容器通过 `parseContainer()` 统一处理，自动提取 params/refs/subContainers。层级过滤由 `ENTITY_LAYER_MAP` 配置驱动，解析器本身不硬编码任何实体类型。从 `AR-PACKAGE` 的 SHORT-NAME 动态提取 ECU 前缀。支持 `BswMPartition` 容器。零 Vue 依赖。
- **`core/graph/chain-tracer.ts`** — 从 `BswMModel` 构建双向邻接表，BFS 追踪完整链路。支持未使用节点检测（不属于任何 RequestPort→Action 完整链路的节点）。特殊边方向由 `SPECIAL_EDGES` 配置。零 Vue 依赖。
- **`core/graph/graph-builder.ts`** — 将 `BswMModel` 转换为 Vue Flow `Node[]` + `Edge[]`。通用范式：节点由 `ENTITY_LAYER_MAP` 推导层级，边由递归遍历 `refs + subContainers.refs` 构建，特殊边由 `SPECIAL_EDGES` 配置。Rule→ActionList 边区分 True（绿色，动画）与 False（红色，虚线）。与 Vue Flow 功能性耦合。
- **`core/graph/layout.ts`** — ELK 分层布局，分区约束确保 6 列结构。ELK 失败时有网格回退布局。与 Vue Flow 功能性耦合。
- **`core/index.ts`** — 桶导出，统一入口 `import { ... } from '@/core'`。

**类型定义**（`src/types/`）：
- **`types/bswm.ts`** — 纯领域类型（`BswMModel`、`BswMEntity`），通用范式，无运行时常量。
- **`types/graph.ts`** — 图桥接类型（`BswMNodeData`、`AdjacencyLists`），连接领域模型与 Vue Flow。

**运行时常量**（`src/constants/`）：
- **`constants/layers.ts`** — 图层分区编号、颜色、中文名、实体→层级映射（`ENTITY_LAYER_MAP`）、特殊边配置（`SPECIAL_EDGES`）。声明式配置驱动整个系统。
- **`constants/graph-styles.ts`** — 边颜色样式、节点尺寸。

**平台工具**（`src/utils/` + `src/composables/`）：
- **`utils/platform.ts`** — Tauri 环境检测、原生文件对话框封装（`open_file` + `read_file` 两个命令）。
- **`composables/usePlatform.ts`** — Vue 组合式函数封装。
- **`composables/useGraphFilter.ts`** — 图层过滤 + 链路高亮 + dimmed/unused 标注 composable，从 BswMGraph.vue 提取。

**状态管理**（`src/stores/`）：
- **`bswm-store.ts`** — Pinia store 管理全部状态：模型、图（shallowRef）、加载/错误、选择、聚焦、图层可见性。计算属性：邻接表、聚焦链路ID集合、未使用节点集合。

**UI 组件**（`src/components/`）：
- **`BswMGraph.vue`** — 主布局：可折叠侧栏 | 图画布 | 可拖拽详情面板。处理节点点击→选择+聚焦、规则高亮→fitView。`useGraphFilter` composable 处理过滤逻辑。
- **`Sidebar.vue`** — 文件加载（Tauri 原生对话框或浏览器 file input）、图层可见性开关、实体类型列表导航（按 ENTITY_LAYER_MAP 分组，点击高亮）、统计信息。可拖拽调整宽度。
- **`Toolbar.vue`** — 缩放控制、重新布局、清除高亮、搜索（智能排序：完全匹配 > 前缀匹配 > 包含匹配）。
- **`DetailPanel.vue`** — 显示选中实体的字段信息（名称、类型、路径 + 递归展示参数/引用/子容器）。使用 `EntityDetail` render 函数组件实现递归展示。可拖拽调整宽度。
- **`EntityDetailRender.ts`** — 递归实体详情渲染组件（render 函数实现，因 Vue SFC 不支持自引用递归）。
- **6 个自定义节点组件** 位于 `src/components/nodes/` — 每种 `NodeLayer` 一个，共享 `BaseNodeProps` 类型。RuleNode 有两个 source handle（true/false）。

**Tauri 后端**（`tauri/`，仅提供 Vue 无法原生实现的功能）：
- **`src/commands.rs`** — 两个命令：`open_file`（原生文件对话框）和 `read_file`（根据路径重读文件，用于"重新加载"功能）。
- **`src/lib.rs`** — App Builder 配置与启动，注册两个命令，debug 模式自动打开 DevTools。
- **设计原则**：所有 UI 逻辑和数据处理都在 Vue 中完成。Tauri 仅负责打包为 Windows exe、提供原生文件对话框。示例文件加载通过 `fetch('/sample/BswM.arxml')` 统一处理，无需 Rust 后端中转。

## 约定

- `@/` 路径别名映射到 `src/`（在 `vite.config.ts` 中配置）
- UI 文本为中文
- 图中节点 ID 为完整 ARXML 路径（如 `/S32K312/BswM/BswMConfig/BswMArbitration/MyRule`）
- 边 ID 遵循 `e-{source}[-{handle}]-{target}` 格式，带去重
- 通用范式：所有 EcuC 容器统一为 `BswMEntity`，层级分类由 `ENTITY_LAYER_MAP` 声明式配置，不由类型硬编码
- 特殊边语义由 `SPECIAL_EDGES` 声明式配置
- `core/` 包含纯业务逻辑（parser、chain-tracer 零 Vue 依赖）和图渲染适配（graph-builder、layout 与 Vue Flow 功能性耦合），类型放 `types/`，常量放 `constants/`，组合式函数放 `composables/`
- Tauri 仅提供 Vue 无法原生实现的功能（原生文件对话框、打包为 Windows exe），所有逻辑和数据处理在 Vue 中完成
- 节点样式通过 CSS 类名（`global.css`）定义，常量颜色（`LAYER_COLORS`）用于侧栏和详情面板
