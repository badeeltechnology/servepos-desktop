import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/auth'
import Setup from './pages/Setup'
import Login from './pages/Login'
import AdminPanel from './pages/AdminPanel'
import POS from './pages/POS'
import CoordinatorScreen from './pages/CoordinatorScreen'

function App() {
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(false)
  const { user, isAdminMode, logout, updateActivity } = useAuthStore()

  useEffect(() => {
    checkSetup()
  }, [])

  // Touch keyboard: only trigger if explicitly enabled in settings (off by default)
  useEffect(() => {
    let enabled = false
    window.api.config.get('touch_keyboard_enabled').then((v: string) => { enabled = v === '1' }).catch(() => {})

    const handleFocus = (e: FocusEvent) => {
      if (!enabled) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        try { (window.api as any).keyboard?.show?.() } catch {}
      }
    }
    document.addEventListener('focusin', handleFocus)
    return () => { document.removeEventListener('focusin', handleFocus) }
  }, [])

  // Inactivity timeout
  useEffect(() => {
    if (!user) return

    const checkInactivity = async () => {
      const timeoutStr = await window.api.config.get('inactivity_timeout')
      const timeoutMinutes = timeoutStr ? parseInt(timeoutStr) : 10
      const timeoutMs = timeoutMinutes * 60 * 1000
      const { lastActivity } = useAuthStore.getState()

      if (Date.now() - lastActivity > timeoutMs) {
        logout()
      }
    }

    const interval = setInterval(checkInactivity, 30000) // check every 30 seconds

    const handleActivity = () => updateActivity()
    window.addEventListener('mousedown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('touchstart', handleActivity)

    return () => {
      clearInterval(interval)
      window.removeEventListener('mousedown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
    }
  }, [user, logout, updateActivity])

  async function checkSetup() {
    try {
      const complete = await window.api.config.isSetupComplete()
      setSetupComplete(complete)
    } catch {
      setSetupComplete(false)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 text-4xl font-bold text-primary">ServePOS</div>
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  // First time setup
  if (!setupComplete) {
    return <Setup onComplete={() => setSetupComplete(true)} />
  }

  // Admin panel (accessed via gear icon)
  if (isAdminMode) {
    return <AdminPanel />
  }

  // Not logged in — show PIN screen
  if (!user) {
    return <Login />
  }

  // Coordinator role → coordinator screen
  if (user.role === 'coordinator') {
    return <CoordinatorScreen />
  }

  // Cashier / Supervisor → POS
  return <POS />
}

export default App
