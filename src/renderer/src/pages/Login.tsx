import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '../stores/auth'
import { useStatus } from '../stores/status'
import { Btn, Dialog, Cap, Field, Keypad, PinDots, Dot, staffColor, initial, KeypadKey, C } from '../ui'
import { Clock } from '../ui/hosts'
import { cn } from '../lib/utils'
import { useT, useLang } from '../stores/i18n'

// Sign in: who is on the till (optional, a hint) + a 6–8 digit PIN that verifies itself.
// "Supervisor tools" opens the admin login (same credentials as before).

export default function Login() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminError, setAdminError] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [staff, setStaff] = useState<any[]>([])
  const [who, setWho] = useState<any>(null)
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const { brand, printers, erpConfigured } = useStatus()
  const [rc, setRc] = useState<Record<string, string>>({})
  const verifySeq = useRef(0)
  const [shakeKey, setShakeKey] = useState(0)
  const t = useT()
  const { lang, setLang } = useLang()
  const fail = (msg: string) => { setError(msg); setPin(''); setShakeKey((k) => k + 1) }

  const { setUser, setAdminMode } = useAuthStore()
  const maxPinLength = 8

  useEffect(() => {
    loadVersionInfo()
    window.api.users.getAll().then((u: any[]) => setStaff((u || []).filter((x) => x.is_active !== 0))).catch(() => {})
    window.api.sessions.getActive().then((s: any) => setShiftOpen(!!s)).catch(() => setShiftOpen(null))
    window.api.receiptConfig.getAll().then((c: any) => setRc(c || {})).catch(() => {})
  }, [])

  async function loadVersionInfo() {
    try {
      const version = await window.api.app.getVersion()
      setAppVersion(version)
      const update = await window.api.app.checkForUpdate()
      if (update?.hasUpdate) setUpdateInfo(update)
    } catch { /* offline */ }
  }

  function signIn(user: any) {
    if (who && user.id !== who.id) {
      fail(t('That PIN isn’t {name}’s', { name: who.name }))
      return
    }
    setPin('')
    setUser(user)
  }

  const handlePinInput = useCallback(
    async (digit: string) => {
      if (pin.length >= maxPinLength) return
      const newPin = pin + digit
      setPin(newPin)
      setError('')

      // Auto-submit when 6+ digits and try verification
      if (newPin.length >= 6) {
        const mySeq = ++verifySeq.current
        try {
          setChecking(true)
          const user = await window.api.users.verifyPin(newPin)
          if (mySeq !== verifySeq.current) return
          if (user) signIn(user)
          else if (newPin.length >= maxPinLength) fail(t('Invalid PIN'))
        } catch {
          // continue, might be 7 or 8 digit pin
        } finally {
          setChecking(false)
        }
      }
    },
    [pin, setUser, who]
  )

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1))
    setError('')
  }, [])

  const handleSubmit = useCallback(async () => {
    if (pin.length < 6) {
      setError(t('PIN must be at least 6 digits'))
      setShakeKey((k) => k + 1)
      return
    }
    try {
      const user = await window.api.users.verifyPin(pin)
      if (user) {
        signIn(user)
      } else {
        fail(t('Invalid PIN'))
      }
    } catch {
      fail('Error verifying PIN')
    }
  }, [pin, setUser, who])

  // Physical keyboard / USB keypad
  useEffect(() => {
    if (showAdminLogin) return
    const h = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) handlePinInput(e.key)
      else if (e.key === 'Backspace') handleBackspace()
      else if (e.key === 'Enter') handleSubmit()
      else if (e.key === 'Escape') { setPin(''); setError('') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handlePinInput, handleBackspace, handleSubmit, showAdminLogin])

  function onKey(k: KeypadKey) {
    if (k === 'back') handleBackspace()
    else if (k === 'C') { setPin(''); setError('') }
    else if (k !== '.') handlePinInput(k)
  }

  const handleAdminLogin = async () => {
    setAdminError('')
    if (!adminUsername || !adminPassword) {
      setAdminError('Please enter username and password')
      return
    }
    try {
      const valid = await window.api.admin.verify(adminUsername, adminPassword)
      if (valid) {
        setAdminMode(true)
        setShowAdminLogin(false)
        setAdminUsername('')
        setAdminPassword('')
      } else {
        setAdminError('Invalid credentials')
      }
    } catch {
      setAdminError('Error verifying credentials')
    }
  }

  const words = brand.name.split(/\s+/)
  const ok = pin.length >= 6
  const now = new Date()

  return (
    <div className="flex h-screen overflow-hidden bg-n-deep text-white">
      <section className="flex w-[380px] flex-shrink-0 flex-col px-9 pb-7 pt-9 max-[1100px]:w-[330px] max-[1100px]:px-7">
        <span className="cond font-bold uppercase leading-[.9] tracking-[.02em] [overflow-wrap:normal]"
          style={{ fontSize: Math.min(window.innerWidth <= 1100 ? 54 : 64, Math.floor((window.innerWidth <= 1100 ? 270 : 305) / (Math.max(...words.map((w) => w.length)) * 0.5))) }}>
          {words.length > 1 ? <>{words[0]}<br />{words.slice(1).join(' ')}</> : brand.name}
        </span>
        <span className="mt-2.5 text-[15px] text-n-mist">{[rc.address_line_1, brand.sub].filter(Boolean).join(' · ')}</span>
        <Clock className="cond num mt-10 text-[56px] font-semibold leading-none" />
        <span className="text-sm text-n-mist">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <span className="flex-1" />
        <div className="flex flex-col gap-2.5 text-[13px] text-n-frost">
          <span className="flex items-center gap-2"><Dot color={erpConfigured ? '#5FD38D' : C.mist} />{erpConfigured ? t('ERPNext set up') : t('ERPNext not set up')}</span>
          <span className="flex items-center gap-2"><Dot color={printers > 0 ? '#5FD38D' : C.amber} />{printers > 0 ? t('{n} printers set up', { n: printers }) : t('No printer set up')}</span>
          <span className="flex items-center gap-2"><Dot color={shiftOpen ? '#5FD38D' : C.mist} />{shiftOpen === null ? t('Checking the shift…') : shiftOpen ? t('A shift is open on this till') : t('No shift open on this till')}</span>
        </div>
        <div className="mt-[22px] flex items-center gap-3">
          <Btn variant="ghostDark" onClick={() => setShowAdminLogin(true)}>{t('Supervisor tools')}</Btn>
          <Btn variant="ghostDark" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} title="Language">{lang === 'ar' ? 'English' : 'العربية'}</Btn>
          <span className="text-xs text-n-steel">v{appVersion}</span>
        </div>
        {updateInfo && (
          <button type="button" onClick={() => window.open(updateInfo.releaseUrl, '_blank')} className="mt-2 self-start text-xs font-semibold text-n-gold">
            Update available: v{updateInfo.latestVersion}
          </button>
        )}
      </section>

      <section className="flex min-w-0 flex-1 gap-5 py-9 pr-9 max-[1100px]:pr-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Cap className="mb-1.5 text-n-mist">{t('Who is on the till')}</Cap>
          <div className="scroll-none flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {staff.map((s) => {
              const on = who?.id === s.id
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => { setWho(on ? null : s); setPin(''); setError('') }}
                  className={cn('press flex h-14 flex-shrink-0 items-center gap-3 rounded-md px-2.5 text-start', on ? 'bg-white text-n-deep' : 'bg-n-rail text-white')}>
                  <span className="cond flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold text-white" style={{ background: staffColor(s.name) }}>{initial(s.name)}</span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="truncate text-base font-semibold">{s.full_name || s.name}</span>
                    <span className="text-xs capitalize opacity-70">{s.role}</span>
                  </span>
                </button>
              )
            })}
            {staff.length === 0 && <span className="text-sm text-n-mist">{t('Staff appear here once they are added in Supervisor tools.')}</span>}
          </div>
        </div>
        <div className="flex w-[262px] flex-shrink-0 flex-col gap-2.5">
          <Cap className="mb-0.5 text-n-mist">{who ? t('{name}, enter your PIN', { name: who.name }) : t('Enter your PIN')}</Cap>
          <div key={shakeKey} className={shakeKey ? 'shake' : ''}><PinDots count={Math.max(6, pin.length)} filled={pin.length} /></div>
          <Keypad className="flex-1" onKey={onKey} />
          <button type="button" onClick={handleSubmit} disabled={!ok}
            className={cn('press flex h-14 items-center justify-center rounded-md text-base font-bold', ok ? 'bg-n-amber text-n-ink' : 'pointer-events-none bg-n-rail text-n-steel')}>
            {checking ? t('Checking…') : ok ? t('Sign in') : t('Enter 6 to 8 digits')}
          </button>
          <span className={cn('min-h-[18px] text-center text-sm', error ? 'font-semibold text-n-coral' : 'text-n-mist')}>{error || t('Signs in by itself once the PIN is right')}</span>
        </div>
      </section>

      {/* Admin login */}
      {showAdminLogin && (
        <Dialog onClose={() => { setShowAdminLogin(false); setAdminUsername(''); setAdminPassword(''); setAdminError('') }} className="w-[420px] text-n-ink" label="Supervisor tools">
          <div className="flex flex-col gap-3 p-5">
            <span className="flex flex-col">
              <span className="cond text-[28px] font-bold leading-none text-n-deep">Supervisor tools</span>
              <span className="text-sm text-n-muted">Admin sign-in for setup, staff, printers and sync.</span>
            </span>
            <label className="flex flex-col gap-1 text-sm font-medium text-n-muted">Username
              <Field type="text" autoFocus value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-n-muted">Password
              <Field type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()} />
            </label>
            {adminError && <p className="text-sm font-semibold text-n-red">{adminError}</p>}
          </div>
          <div className="flex gap-2 bg-white px-4 py-3">
            <Btn size="lg" variant="outline" onClick={() => { setShowAdminLogin(false); setAdminUsername(''); setAdminPassword(''); setAdminError('') }}>Cancel</Btn>
            <span className="flex-1" />
            <Btn size="lg" variant="deep" onClick={handleAdminLogin}>Sign in</Btn>
          </div>
        </Dialog>
      )}
    </div>
  )
}
