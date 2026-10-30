import { app, shell, BrowserWindow, nativeImage, ipcMain, dialog, protocol, net } from 'electron'
import { join } from 'path'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase } from './database/schema'
import { registerIpcHandlers, drainIpcHandlers, resumeIpcHandlers } from './ipc/handlers'
import { startAutoSync, stopAndDrainSync } from './sync/sync-engine'
import { getImageDir } from './sync/image-cache'
import { startPrintWorker, stopPrintWorker } from './print/printer'
import { warmArabicRenderer } from './print/arabic-bitmap'
import { initUpdater } from './updater'

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

  // Closing the till window destroys it while the app is still finishing sync in the background.
  // Drop the reference so nothing calls into a destroyed window.
  mainWindow.on('closed', () => { mainWindow = null })

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
let reopenRequested = false
// Someone launched ServePOS again while this process is still running.
app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    return
  }
  // The window was closed and the app is still saving and syncing before it exits:
  // restart once that finishes instead of crashing on the closed window.
  if (shuttingDown) { reopenRequested = true; return }
  if (app.isReady()) createWindow()
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

  // Printing: start the Windows print worker and the Arabic renderer now, not on the first KOT
  startPrintWorker()
  warmArabicRenderer().catch(() => {})

  // In-app updates: checks on the chosen channel, never downloads or installs by itself.
  // The renderer drives download and restart (Supervisor settings → Updates).
  initUpdater({
    prepareForInstall: async () => {
      try {
        await Promise.all([drainIpcHandlers(), stopAndDrainSync()])
        await closeDatabase()
        shutdownComplete = true
      } catch (error) {
        resumeIpcHandlers()
        throw error
      }
    }
  })

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
      stopPrintWorker()
      await closeDatabase()
      shutdownComplete = true
      if (reopenRequested) app.relaunch()
      app.quit()
    } catch (error: any) {
      shuttingDown = false
      reopenRequested = false
      resumeIpcHandlers()
      dialog.showErrorBox('Unable to close database safely', error.message)
      // Do not leave a running app with no window: bring the till back.
      if (!mainWindow || mainWindow.isDestroyed()) createWindow()
    }
  })()
})
