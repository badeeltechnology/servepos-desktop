import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from './stores/auth'
import Setup from './pages/Setup'
import Login from './pages/Login'
import AdminPanel from './pages/AdminPanel'
import POS from './pages/POS'
import CoordinatorScreen from './pages/CoordinatorScreen'
import { KeyboardProvider } from './components/keyboard'
import { ToastHost, ConfirmHost } from './ui/hosts'
import { loadBrand } from './stores/status'
import { useSessionGuard } from './stores/ui'
import { useT } from './stores/i18n'
import { Btn } from './ui'

function App() {
  const [loading, setLoading] = useState(true)
  const [setupComplete, setSetupComplete] = useState(false)
  const { user, isAdminMode, logout, updateActivity } = useAuthStore()

  useEffect(() => {
    checkSetup()
  }, [])

  // Brand line + printer count for the status band (re-read after setup / admin changes)
  useEffect(() => {
    if (setupComplete) loadBrand()
  }, [setupComplete, isAdminMode, user])

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

  // Inactivity timeout: warn first ("Still there?"), then put the open order on hold and sign out.
  // Never times out while the payment screen is open. inactivity_timeout is in minutes (0 = off).
  const [idleWarn, setIdleWarn] = useState<number | null>(null)
  const lastTouch = useRef(Date.now())
  const signingOut = useRef(false)
  useEffect(() => {
    if (!user) { setIdleWarn(null); return }
    lastTouch.current = Date.now()
    signingOut.current = false
    let timeoutMs = 10 * 60 * 1000
    window.api.config.get('inactivity_timeout').then((v: string) => {
      const minutes = v !== null && v !== undefined && v !== '' ? parseFloat(v) : 10
      timeoutMs = Number.isFinite(minutes) ? minutes * 60 * 1000 : 10 * 60 * 1000
    }).catch(() => {})

    const handleActivity = () => { lastTouch.current = Date.now(); updateActivity() }
    window.addEventListener('mousedown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('touchstart', handleActivity)

    const tick = setInterval(async () => {
      if (timeoutMs <= 0 || signingOut.current) { setIdleWarn(null); return }
      if (useSessionGuard.getState().paymentOpen) { lastTouch.current = Date.now(); setIdleWarn(null); return }
      const idle = Date.now() - lastTouch.current
      const warnMs = Math.min(30000, timeoutMs / 3)
      if (idle >= timeoutMs) {
        signingOut.current = true
        setIdleWarn(null)
        try { await useSessionGuard.getState().beforeSignOut?.() } catch { /* still sign out */ }
        logout()
      } else if (idle >= timeoutMs - warnMs) {
        setIdleWarn(Math.ceil((timeoutMs - idle) / 1000))
      } else {
        setIdleWarn((w) => (w === null ? w : null))
      }
    }, 1000)

    return () => {
      clearInterval(tick)
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

  return (
    <>
      {renderScreen()}
      {idleWarn !== null && <StillThere seconds={idleWarn} onHere={() => { lastTouch.current = Date.now(); setIdleWarn(null) }} />}
      <ToastHost />
      <ConfirmHost />
    </>
  )

  function renderScreen() {
    if (loading) {
      return (
        <div className="flex h-screen items-center justify-center bg-n-deep text-white">
          <div className="text-center">
            <div className="cond mb-2 text-5xl font-bold tracking-[.03em]">ServePOS</div>
            <div className="text-sm text-n-mist">Loading…</div>
          </div>
        </div>
      )
    }

    // First time setup
    if (!setupComplete) {
      return <Setup onComplete={() => setSetupComplete(true)} />
    }

    // Admin panel (opened from "Supervisor tools" on the sign-in screen)
    if (isAdminMode) {
      return <AdminPanel />
    }

    // Not logged in — show PIN screen
    if (!user) {
      return <Login />
    }

    // Coordinator role → coordinator screen
    if (user.role === 'coordinator') {
      return (
        <KeyboardProvider>
          <CoordinatorScreen />
        </KeyboardProvider>
      )
    }

    // Cashier / Supervisor → POS
    return (
      <KeyboardProvider>
        <POS />
      </KeyboardProvider>
    )
  }
}

function StillThere({ seconds, onHere }: { seconds: number; onHere: () => void }) {
  const t = useT()
  return (
    <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-[rgba(11,59,73,.7)] p-4" role="alertdialog" aria-label={t('Still there?')}>
      <div className="flex w-[440px] animate-rise flex-col items-center gap-3 bg-n-cream px-6 pb-5 pt-6 text-center shadow-pop">
        <span className="cond text-[34px] font-bold leading-none text-n-deep">{t('Still there?')}</span>
        <span className="cond num text-[64px] font-bold leading-none text-n-red">{seconds}</span>
        <span className="text-sm text-n-muted">{t('Signing out in {n}s. The open order will be put on hold.', { n: seconds })}</span>
        <Btn size="xl" variant="amber" className="mt-1 w-full" onClick={onHere}>{t("I'm here")}</Btn>
      </div>
    </div>
  )
}

export default App
