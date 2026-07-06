import { app, shell, BrowserWindow, nativeImage, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDatabase, closeDatabase } from './database/schema'
import { registerIpcHandlers } from './ipc/handlers'
import { startAutoSync, stopAutoSync } from './sync/sync-engine'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const iconPath = join(__dirname, '../../resources/icon.png')

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'ServePOS',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.servepos.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize database (async for sql.js WASM loading)
  await initDatabase()

  // Modifiers are synced from ERPNext — no local seeding

  // Register IPC handlers
  registerIpcHandlers()

  // Windows touch keyboard support
  if (process.platform === 'win32') {
    ipcMain.handle('keyboard:show', () => {
      // Use async exec to avoid blocking the main process
      exec('powershell -Command "Start-Process -FilePath \\"C:\\Program Files\\Common Files\\microsoft shared\\ink\\TabTip.exe\\""', { windowsHide: true, timeout: 3000 }, (err) => {
        if (err) exec('start "" "C:\\Windows\\System32\\osk.exe"', { windowsHide: true })
      })
      return { success: true }
    })
  }

  // Start auto-sync if configured
  startAutoSync()

  createWindow()

  // Auto-update (production only)
  if (!is.dev) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Available',
        message: `ServePOS v${info.version} is available. Download now?`,
        buttons: ['Download', 'Later'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate()
      })
    })

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: 'Update has been downloaded. Restart now to install?',
        buttons: ['Restart', 'Later'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
    })

    autoUpdater.checkForUpdates().catch(() => {})
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopAutoSync()
  closeDatabase()
})
