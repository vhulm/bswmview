// ============================================================
// 平台工具 — Tauri 桌面环境检测与原生文件对话框封装
//
// 设计原则：所有 UI 逻辑和数据处理都在 Vue 中完成，
// Tauri 仅提供 Vue 无法原生实现的功能（原生文件对话框）。
// 示例文件加载通过 fetch 完成，不需要 Rust 后端中转。
// ============================================================

/** Tauri 后端命令的返回类型 */
export interface FileContent {
  name: string
  content: string
  path: string
}

/** 是否在 Tauri 桌面环境中运行 */
export const isTauri: boolean = '__TAURI_INTERNALS__' in window

/** 通过原生 Tauri 对话框打开文件，用户取消时返回 null */
export async function openNativeFile(): Promise<FileContent | null> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<FileContent | null>('open_file')
}

/** 根据文件路径重新读取文件内容（无需对话框） */
export async function reloadNativeFile(filePath: string): Promise<FileContent> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<FileContent>('read_file', { filePath })
}
