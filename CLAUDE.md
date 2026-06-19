# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

BswM Viewer — AUTOSAR BswM（基础软件模式管理器）配置可视化工具。解析 AUTOSAR ARXML 文件，将 BswM 仲裁逻辑渲染为交互式有向图（6 层 DAG）。

## 常用命令

- `npm run dev` — 启动 Vite 开发服务器
- `npm run build` — 先用 `vue-tsc -b` 类型检查，再用 Vite 构建
- `npm run preview` — 本地预览生产构建
- 未配置测试运行器

## 技术栈

- Vue 3（组合式 API + `<script setup>`）+ TypeScript + Vite
- **Vue Flow** (`@vue-flow/core`) — 图渲染
- **ELK.js** — 自动图布局（分层算法 + 分区约束）
- **fast-xml-parser** — ARXML 解析
- **Pinia** — 状态管理
- **Tailwind CSS 4** — 样式（通过 `@tailwindcss/vite` 插件集成，CSS-first 配置）

## 架构与数据流

```
ARXML 文件 → arxml-parser.ts → BswMModel → graph-builder.ts → Vue Flow 节点/边 → layout.ts (ELK) → 渲染图
```

流程由 Pinia store (`bswm-store.ts`) 编排：
1. `loadArxml(content)` 调用 `parseBswMArxml()` → 存储 `BswMModel`
2. `rebuildGraph()` 调用 `buildGraph()` → 原始节点/边，再调用 `applyElkLayout()` → 定位后的节点
3. Vue Flow 渲染定位后的图

### 核心数据结构

**`BswMModel`**（`src/types/bswm.ts`）— 核心领域模型，由 7 个 `Map<string, T>` 集合组成，以 ARXML 路径为键：
- `requestPorts` → `conditions` → `expressions` → `rules` → `actionLists` → `actions` → `modeInitValues`
- 路径与 ARXML `VALUE-REF` 一致，跨引用通过 Map 直接查找

**6 层 DAG** — 节点从左到右流经以下层（由 ELK `elk.partition` 约束）：
1. RequestPort（输入）→ 2. Condition（比较）→ 3. Expression（逻辑）→ 4. Rule（仲裁）→ 5. ActionList → 6. Action（输出）

### 模块职责

- **`arxml-parser.ts`** — 将 ARXML 解析为 `BswMModel`。从 `AR-PACKAGE` 的 SHORT-NAME 动态提取 ECU 前缀（不硬编码）。支持 `BswMPartition` 容器。未识别的 Action 类型保留 `DEFINITION-REF` 最后一段。
- **`graph-builder.ts`** — 将 `BswMModel` 转换为 Vue Flow `Node[]` + `Edge[]`。每个实体仅出现一次，多次引用产生多条边。Rule→ActionList 边区分 True（绿色，动画）与 False（红色，虚线）。
- **`layout.ts`** — ELK 分层布局，分区约束确保 6 列结构。ELK 失败时有网格回退布局。
- **`bswm-store.ts`** — Pinia store 管理全部状态：模型、图、选择、高亮、图层可见性、搜索。规则高亮通过递归收集所有关联节点路径实现。

### UI 组件

- **`BswMGraph.vue`** — 主布局：侧栏 | 图画布 | 详情面板。处理节点点击→选择、规则高亮→fitView、图层/搜索过滤。
- **`Sidebar.vue`** — 文件加载（上传或示例）、图层可见性开关、规则列表导航（点击高亮）。
- **`Toolbar.vue`** — 缩放控制、布局方向切换（LR/TB）、重新布局、搜索。
- **`DetailPanel.vue`** — 显示选中节点的字段信息（不同实体类型显示不同字段）。
- **6 个自定义节点组件** 位于 `src/graph/nodes/` — 每种 `NodeLayer` 一个，使用 `LAYER_COLORS` 样式。

## 约定

- `@/` 路径别名映射到 `src/`（在 `vite.config.ts` 中配置）
- UI 文本为中文
- 图中节点 ID 为完整 ARXML 路径（如 `/S32K312/BswM/BswMConfig/BswMArbitration/MyRule`）
- 边 ID 遵循 `e-{source}[-{handle}]-{target}` 格式，带去重
