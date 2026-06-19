import { contextBridge, ipcRenderer } from 'electron'

// 类型定义见 src/types/electron.d.ts（渲染进程侧），
// 此处通过 contextBridge 暴露与该类型一致的 API

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  loadDemoFile: () => ipcRenderer.invoke('demo:loadFile'),
})
