import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron'
import { join, basename } from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// ESM 中替代 __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 开发环境标识
const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: '',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 完全移除菜单栏（autoHideMenuBar 只是隐藏，Alt 仍可呼出）
  Menu.setApplicationMenu(null)

  // 阻止 HTML <title> 覆盖窗口标题，保持标题栏为空
  mainWindow.on('page-title-updated', (e) => e.preventDefault())

  if (isDev) {
    // 开发环境：加载 Vite dev server
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // 生产环境：加载打包后的 index.html
    mainWindow.loadFile(join(__dirname, '../web/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---- IPC Handlers ----

/** 打开原生文件选择对话框，读取 .arxml 文件 */
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 ARXML 文件',
    filters: [
      { name: 'ARXML 文件', extensions: ['arxml', 'xml'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const filePath = result.filePaths[0]
  const fileName = basename(filePath)

  try {
    const content = await readFile(filePath, 'utf-8')
    return { name: fileName, content }
  } catch (err: any) {
    console.error('读取文件失败:', err)
    return null
  }
})

/** 加载示例 BswM.arxml 文件 */
ipcMain.handle('demo:loadFile', async () => {
  try {
    // 生产环境：从 dist/web 目录读取（Vite 已将 public/ 复制到 dist/web/）
    // 开发环境：从 public 目录读取
    const filePath = isDev
      ? join(__dirname, '../../public/BswM.arxml')
      : join(__dirname, '../web/BswM.arxml')

    const content = await readFile(filePath, 'utf-8')
    return { name: 'BswM.arxml', content }
  } catch (err: any) {
    console.error('加载示例文件失败:', err)
    return null
  }
})

// ---- App Lifecycle ----

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
