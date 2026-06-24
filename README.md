# BswM Viewer — AUTOSAR BswM 配置可视化工具

将 AUTOSAR BswM（基础软件模式管理器）的 ARXML 配置文件解析为交互式有向图，直观展示请求端口、模式条件、逻辑表达式、仲裁规则、动作列表、动作之间的完整依赖关系。

![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)

## 功能特性

- **ARXML 解析** — 支持 AUTOSAR BswM 标准配置格式（EcuC），自动识别 ECU 前缀，兼容 BswMPartition 容器结构
- **通用范式解析** — 所有 EcuC 容器统一为 `BswMEntity`，自动提取参数和引用，零信息丢失，新增实体类型无需修改解析器
- **6 层 DAG 可视化** — 请求端口 → 模式条件 → 逻辑表达式 → 仲裁规则 → 动作列表 → 动作，从左到右自动布局
- **智能图布局** — 基于 ELK.js 分层算法，分区约束保证层级清晰，正交边路由避免线缆交错
- **规则高亮** — 点击侧栏规则，自动高亮其关联的完整链路并聚焦视图
- **未使用节点检测** — 自动识别不属于任何完整链路（RequestPort→Action）的节点并标记
- **图层过滤** — 可独立开关每一层节点的显示/隐藏
- **搜索过滤** — 按名称实时搜索实体，智能排序（完全匹配 > 前缀匹配 > 包含匹配）
- **详情面板** — 点击节点查看完整配置属性，递归展示参数、引用、子容器
- **可拖拽面板** — 侧栏和详情面板宽度可拖拽调整
- **Tauri 桌面打包** — 可打包为 Windows 原生应用，提供原生文件选择对话框

## 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| 框架 | Vue 3 + TypeScript | 组合式 API + `<script setup>` |
| 构建工具 | Vite | 快速开发服务器与构建 |
| 图渲染 | @vue-flow/core | Vue 3 节点连线图 |
| 自动布局 | ELK.js | 分层 DAG 布局，支持分区约束 |
| ARXML 解析 | fast-xml-parser | 高性能 XML 解析 |
| 状态管理 | Pinia | Vue 3 官方推荐状态库 |
| 样式 | Tailwind CSS 4 | 原子化 CSS（通过 @tailwindcss/vite 插件集成） |
| 桌面打包 | Tauri 2 | 提供 Windows 原生文件对话框 + exe 打包 |

## 开发环境搭建

### 前置条件

- **Node.js** ≥ 20.0.0（推荐 22.x LTS）
- **npm** ≥ 10.0.0（随 Node.js 安装）
- **Rust** ≥ 1.77（仅 Tauri 桌面打包需要）

### 搭建步骤

```bash
# 1. 克隆仓库
git clone <仓库地址>
cd bswmview

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

开发服务器默认监听 `0.0.0.0:5173`，可在局域网内访问。

### 加载示例文件

启动后在浏览器中打开，点击左侧「加载示例 BswM.arxml」按钮即可加载预置的示例配置。也可以通过文件选择器上传自己的 ARXML 文件。

## 项目结构

```
bswmview/
├── public/
│   ├── sample/
│   │   └── BswM.arxml       # 示例 ARXML 配置文件
│   └── favicon.svg          # 网站图标
├── src/
│   ├── main.ts              # 应用入口
│   ├── App.vue              # 根组件
│   ├── core/                # 核心业务逻辑
│   │   ├── index.ts         # 桶导出
│   │   ├── parser/
│   │   │   └── arxml-parser.ts  # ARXML 解析器（通用范式，零 Vue 依赖）
│   │   └── graph/
│   │       ├── graph-builder.ts # 数据模型 → Vue Flow 节点/边（声明式配置驱动）
│   │       ├── chain-tracer.ts  # 链路追踪与未使用节点检测（零 Vue 依赖）
│   │       └── layout.ts        # ELK.js 自动布局（与 Vue Flow 功能性耦合）
│   ├── types/
│   │   ├── bswm.ts          # BswM 领域类型定义（通用 BswMEntity 模型）
│   │   └── graph.ts         # 图桥接类型（BswMNodeData, AdjacencyLists）
│   ├── constants/
│   │   ├── layers.ts        # 图层分区、颜色、标签、实体映射、特殊边配置
│   │   └── graph-styles.ts  # 边颜色样式、节点尺寸
│   ├── composables/
│   │   ├── useGraphFilter.ts # 图层过滤 + 链路高亮 composable
│   │   └── usePlatform.ts   # Tauri 平台检测组合式函数
│   ├── utils/
│   │   └── platform.ts      # 平台工具（Tauri 检测、原生文件对话框封装）
│   ├── components/
│   │   ├── BswMGraph.vue    # 主图组件（侧栏+画布+详情）
│   │   ├── Sidebar.vue      # 侧栏（文件加载/图层过滤/实体列表导航）
│   │   ├── DetailPanel.vue  # 节点详情面板（递归展示实体结构）
│   │   ├── EntityDetailRender.ts # 递归实体详情渲染（render 函数实现）
│   │   ├── Toolbar.vue      # 工具栏（缩放/布局/搜索/高亮清除）
│   │   └── nodes/           # 6 种自定义节点组件
│   │       ├── BaseNodeProps.ts  # 共享 props 类型
│   │       ├── RequestPortNode.vue
│   │       ├── ConditionNode.vue
│   │       ├── ExpressionNode.vue
│   │       ├── RuleNode.vue
│   │       ├── ActionListNode.vue
│   │       └── ActionNode.vue
│   ├── stores/
│   │   └── bswm-store.ts    # Pinia 状态管理
│   └── styles/
│       └── global.css       # 全局样式（含节点 CSS 样式）
├── tauri/                   # Tauri 桌面打包
│   ├── src/
│   │   ├── commands.rs      # 原生文件对话框 + 文件重读命令
│   │   ├── lib.rs           # App Builder 配置
│   │   └── main.rs          # 入口
│   └── tauri.conf.json      # Tauri 配置
├── docs/
│   └── architecture.md      # 架构设计文档
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 开发指南

### 常用命令

```bash
npm run dev         # 启动开发服务器（热更新）
npm run build:web   # Web 版本构建（类型检查 + Vite 构建）
npm run build       # Tauri 桌面应用构建
npm run preview     # 预览 Web 构建结果
```

### 添加新的实体类型

通用范式设计下，大多数新实体类型**无需修改解析器**——`parseContainer()` 自动提取所有参数和引用。

只需修改声明式配置：

1. **`src/constants/layers.ts`** — 在 `ENTITY_LAYER_MAP` 中添加新实体的类型→层级映射
2. 如果需要在 DAG 图中显示为新层级，还需更新 `NodeLayer`、`LAYER_PARTITION`、`LAYER_COLORS`、`LAYER_LABEL`
3. 如果有特殊边语义，在 `SPECIAL_EDGES` 中配置
4. **`src/components/nodes/`** — 新建对应节点组件（如果是新层级）
5. **`src/components/BswMGraph.vue`** — 在 `nodeTypes` 中注册新组件

### 修改节点样式

节点颜色由两处定义：
- **CSS 样式** 在 `src/styles/global.css` 中定义（如 `.bswm-node-request`）
- **常量颜色** 在 `src/constants/layers.ts` 的 `LAYER_COLORS` 中定义（用于侧栏和详情面板）

节点组件在 `src/components/nodes/` 目录下，每个组件独立控制自身布局和样式。

### 修改图布局参数

图布局参数在 `src/core/graph/layout.ts` 的 `applyElkLayout` 函数中定义，包括层间距、节点间距、边路由策略等。

## 依赖更新

```bash
# 查看过期依赖
npm outdated

# 更新兼容版本（遵循 package.json 中的 semver 范围）
npm update

# 更新到最新版本（可能跨越大版本）
npm install <包名>@latest

# 更新后验证
npm run build:web
```

**注意**：
- Tailwind CSS 已升级至 4.x，使用 CSS-first 配置 + `@tailwindcss/vite` 插件集成，不再需要 `tailwind.config.js` 和 `postcss.config.js`
- `@types/node` 大版本跳跃可能引入不兼容变更，建议在当前大版本内更新

## 构建与部署

### Web 版本

```bash
# 生产构建
npm run build:web

# 构建产物在 dist/ 目录，可直接部署到静态文件服务器
# 本地预览构建结果
npm run preview
```

### Tauri 桌面版本

```bash
# 构建桌面应用（需要 Rust 工具链）
npm run build
```

## ARXML 格式说明

本项目支持 AUTOSAR BswM 的 EcuC（ECUC-MODULE-CONFIGURATION-VALUES）格式 ARXML。不支持非 EcuC 格式（如 Vector 工具生成的 SERVICE-SW-COMPONENT-TYPE 格式）。

已验证支持的配置元素：

| 实体类型 | 说明 |
|---------|------|
| BswMModeRequestPort | 模式请求端口（含 9 种来源类型） |
| BswMEventRequestPort | 事件请求端口 |
| BswMModeCondition | 模式条件（EQUALS / NOT_EQUALS） |
| BswMLogicalExpression | 逻辑表达式（AND / OR / XOR / NAND / NOR / NXOR / NOT） |
| BswMRule | 仲裁规则（初始状态: UNDEFINED / TRUE / FALSE） |
| BswMActionList | 动作列表（执行模式: TRIGGER / CONDITIONAL） |
| BswMAction | 动作（14+ 种子类型，未知类型自动 fallback） |
