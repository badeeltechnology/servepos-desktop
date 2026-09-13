import { app, shell, BrowserWindow, nativeImage, ipcMain, dialog, protocol, net } from 'electron'
import { join } from 'path'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { initDatabase, closeDatabase } from './database/schema'
import { registerIpcHandlers, drainIpcHandlers, resumeIpcHandlers } from './ipc/handlers'
import { startAutoSync, stopAndDrainSync } from './sync/sync-engine'
import { getImageDir } from './sync/image-cache'

// Register scheme as privileged before app ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'cached-image', privileges: { bypassCSP: true, supportFetchAPI: true } }
])

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

const ownsInstance = app.requestSingleInstanceLock()
if (!ownsInstance) app.quit()
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
})

if (ownsInstance) app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.servepos.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register custom protocol for cached images
  protocol.handle('cached-image', (request) => {
    // URL format: cached-image://file/FILENAME.png
    const filename = decodeURIComponent(request.url.replace('cached-image://file/', ''))
    const filePath = join(getImageDir(), filename)
    return net.fetch(`file://${filePath}`)
  })

  // Open native SQLite in its dedicated worker, migrating legacy snapshots safely
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
}).catch((error: Error) => {
  dialog.showErrorBox('Database could not be opened', error.message)
  app.quit()
})

app.on('window-all-closed', () => {
  // macOS activate reuses the open database instead of reopening a closed handle.
  if (process.platform !== 'darwin') app.quit()
})

let shutdownComplete = false
let shuttingDown = false
app.on('before-quit', event => {
  if (shutdownComplete || !ownsInstance) return
  event.preventDefault()
  if (shuttingDown) return
  shuttingDown = true
  void (async () => {
    try {
      await Promise.all([drainIpcHandlers(), stopAndDrainSync()])
      await closeDatabase()
      shutdownComplete = true
      app.quit()
    } catch (error: any) {
      shuttingDown = false
      resumeIpcHandlers()
      dialog.showErrorBox('Unable to close database safely', error.message)
    }
  })()
})
