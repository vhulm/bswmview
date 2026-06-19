// ============================================================
// Core — 纯业务逻辑统一入口（零 Vue 依赖）
// ============================================================

export { parseBswMArxml } from './parser/arxml-parser'
export { buildGraph } from './graph/graph-builder'
export { buildAdjacency, traceChain, findUnusedNodes } from './graph/chain-tracer'
export { applyElkLayout } from './graph/layout'
