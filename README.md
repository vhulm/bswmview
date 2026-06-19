# BswM Viewer — AUTOSAR BswM 配置可视化工具

将 AUTOSAR BswM（基础软件模式管理器）的 ARXML 配置文件解析为交互式有向图，直观展示请求端口、模式条件、逻辑表达式、仲裁规则、动作列表、动作之间的完整依赖关系。

![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)

## 功能特性

- **ARXML 解析** — 支持 AUTOSAR BswM 标准配置格式，自动识别 ECU 前缀，兼容 BswMPartition 容器结构
- **6 层 DAG 可视化** — 请求端口 → 模式条件 → 逻辑表达式 → 仲裁规则 → 动作列表 → 动作，从左到右自动布局
- **智能图布局** — 基于 ELK.js 分层算法，分区约束保证层级清晰，正交边路由避免线缆交错
- **规则高亮** — 点击侧栏规则，自动高亮其关联的完整链路并聚焦视图
- **图层过滤** — 可独立开关每一层节点的显示/隐藏
- **搜索过滤** — 按名称实时搜索实体
- **详情面板** — 点击节点查看完整配置属性
- **多格式兼容** — 已验证支持 S32K312/S32K148/RK2118M2 等不同 ECU 的配置文件

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

## 开发环境搭建

### 前置条件

- **Node.js** ≥ 20.0.0（推荐 22.x LTS）
- **npm** ≥ 10.0.0（随 Node.js 安装）

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
│   ├── BswM.arxml          # 示例 ARXML 配置文件
│   └── favicon.svg         # 网站图标
├── src/
│   ├── main.ts             # 应用入口
│   ├── App.vue             # 根组件
│   ├── types/
│   │   └── bswm.ts         # BswM 数据模型类型定义
│   ├── parser/
│   │   └── arxml-parser.ts # ARXML 解析器
│   ├── graph/
│   │   ├── graph-builder.ts # 数据模型 → Vue Flow 节点/边
│   │   ├── layout.ts        # ELK.js 自动布局
│   │   └── nodes/           # 6 种自定义节点组件
│   │       ├── RequestPortNode.vue
│   │       ├── ConditionNode.vue
│   │       ├── ExpressionNode.vue
│   │       ├── RuleNode.vue
│   │       ├── ActionListNode.vue
│   │       └── ActionNode.vue
│   ├── components/
│   │   ├── BswMGraph.vue   # 主图组件（侧栏+画布+详情）
│   │   ├── Sidebar.vue     # 侧栏（文件加载/规则列表）
│   │   ├── DetailPanel.vue # 节点详情面板
│   │   └── Toolbar.vue     # 工具栏（缩放/布局/搜索）
│   ├── stores/
│   │   └── bswm-store.ts   # Pinia 状态管理
│   └── styles/
│       └── global.css      # 全局样式
├── docs/
│   └── 架构设计.md          # 架构设计文档
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 开发指南

### 常用命令

```bash
npm run dev       # 启动开发服务器（热更新）
npm run build     # 类型检查 + 生产构建
npm run preview   # 预览生产构建
```

### 添加新的 Action 类型

当需要支持新的 BswM Action 类型时（如从新 ARXML 中发现的类型），需修改三个文件：

1. **`src/types/bswm.ts`** — 在 `ActionType` 联合类型中添加新类型
2. **`src/parser/arxml-parser.ts`** — 在 `parseAction` 的 if-else 链中添加新分支，提取该 Action 的参数和引用
3. **`src/graph/graph-builder.ts`** — 在 `getActionDetailStr` 的 switch 中添加显示逻辑

未识别的 Action 类型会自动走 fallback：保留 `DEFINITION-REF` 最后一段作为类型名，参数不丢失。

### 添加新的请求端口来源类型

1. **`src/types/bswm.ts`** — 在 `RequestSourceType` 中添加新类型
2. **`src/parser/arxml-parser.ts`** — 在 `parseRequestPort` 的 if-else 链中添加新分支

### 修改节点样式

每种节点的颜色在 `src/types/bswm.ts` 的 `LAYER_COLORS` 中定义。节点组件在 `src/graph/nodes/` 目录下，每个组件独立控制自身布局和样式。

### 修改图布局参数

图布局参数在 `src/graph/layout.ts` 的 `applyElkLayout` 函数中定义，包括层间距、节点间距、边路由策略等。

## 依赖更新

```bash
# 查看过期依赖
npm outdated

# 更新兼容版本（遵循 package.json 中的 semver 范围）
npm update

# 更新到最新版本（可能跨越大版本）
npm install <包名>@latest

# 更新后验证
npm run build
```

**注意**：
- Tailwind CSS 已升级至 4.x，使用 CSS-first 配置 + `@tailwindcss/vite` 插件集成，不再需要 `tailwind.config.js` 和 `postcss.config.js`
- `@types/node` 大版本跳跃可能引入不兼容变更，建议在当前大版本内更新

## 构建与部署

```bash
# 生产构建
npm run build

# 构建产物在 dist/ 目录，可直接部署到静态文件服务器
# 本地预览构建结果
npm run preview
```

## ARXML 格式说明

本项目支持 AUTOSAR BswM 的 EcuC（ECUC-MODULE-CONFIGURATION-VALUES）格式 ARXML。不支持非 EcuC 格式（如 Vector 工具生成的 SERVICE-SW-COMPONENT-TYPE 格式）。

已验证支持的配置元素：

| 实体类型 | 枚举值 / 子类型 |
|---------|---------------|
| 请求端口来源 | EcuMIndication, EcuMRUNRequestIndication, EcuMWakeupSource, CanSMIndication, ComMIndication, ComMPncRequest, DcmComModeRequest, GenericRequest, Timer |
| 条件类型 | EQUALS, NOT_EQUALS |
| 逻辑操作符 | AND, OR, XOR, NAND, NOR, NXOR, NOT |
| 规则初始状态 | UNDEFINED, TRUE, FALSE |
| ActionList 执行模式 | TRIGGER, CONDITIONAL |
| 请求处理方式 | IMMEDIATE, DEFERRED |
| 动作类型 | EcuMDriverInitList, EcuMGoDown, EcuMSelectShutdownTarget, EcuMStateSwitch, ComMAllowCom, ComMModeSwitch, PduGroupSwitch, PduRouterControl, DeadlineMonitoringControl, NMControl, UserCallout, RteSwitch, SchMModeSwitch, NvMBlockJobControl |
