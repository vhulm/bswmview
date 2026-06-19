/**
 * Electron preload 脚本暴露的 API 类型（规范定义）
 * @see electron/preload.ts — 实际实现
 */
export interface ElectronAPI {
  /** 打开原生文件选择对话框，返回选中的文件名和内容 */
  openFile: () => Promise<{ name: string; content: string } | null>
  /** 加载内置的示例 BswM.arxml 文件 */
  loadDemoFile: () => Promise<{ name: string; content: string } | null>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
