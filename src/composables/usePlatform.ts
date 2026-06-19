// ============================================================
// usePlatform — Tauri 平台检测组合式函数
//
// 提供 Tauri 环境感知能力，使 Vue 组件能根据运行环境
// 选择原生文件对话框或浏览器 <input type="file">。
// ============================================================

import { isTauri, openNativeFile, reloadNativeFile } from '@/utils/platform'
import type { FileContent } from '@/utils/platform'

/**
 * 提供平台感知的文件操作能力
 *
 * - `isTauri` — 是否运行在 Tauri 桌面环境中
 * - `openNativeFile()` — 调用原生文件对话框（仅 Tauri 可用）
 * - `reloadNativeFile()` — 根据文件路径重新读取文件（仅 Tauri 可用）
 */
export function usePlatform() {
  return { isTauri, openNativeFile, reloadNativeFile } as {
    isTauri: boolean
    openNativeFile: () => Promise<FileContent | null>
    reloadNativeFile: (filePath: string) => Promise<FileContent>
  }
}
