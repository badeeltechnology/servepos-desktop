import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/auth'
import { Settings, ArrowUpCircle } from 'lucide-react'

export default function Login() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const [updateInfo, setUpdateInfo] = useState<any>(null)

  useEffect(() => {
    loadVersionInfo()
  }, [])

  async function loadVersionInfo() {
    const version = await window.api.app.getVersion()
    setAppVersion(version)
    const update = await window.api.app.checkForUpdate()
    if (update.hasUpdate) setUpdateInfo(update)
  }
  const [adminError, setAdminError] = useState('')

  const { setUser, setAdminMode } = useAuthStore()

  const maxPinLength = 8

  const handlePinInput = useCallback(
    async (digit: string) => {
      if (pin.length >= maxPinLength) return
      const newPin = pin + digit
      setPin(newPin)
      setError('')

      // Auto-submit when 6+ digits and try verification
      if (newPin.length >= 6) {
        try {
          const user = await window.api.users.verifyPin(newPin)
          if (user) {
            setPin('')
            setUser(user)
          }
        } catch {
          // continue, might be 7 or 8 digit pin
        }
      }
    },
    [pin, setUser]
  )

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1))
    setError('')
  }, [])

  const handleSubmit = useCallback(async () => {
    if (pin.length < 6) {
      setError('PIN must be at least 6 digits')
      return
    }
    try {
      const user = await window.api.users.verifyPin(pin)
      if (user) {
        setPin('')
        setUser(user)
      } else {
        setError('Invalid PIN')
        setPin('')
      }
    } catch {
      setError('Error verifying PIN')
      setPin('')
    }
  }, [pin, setUser])

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

  const numpadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['backspace', '0', 'enter']
  ]

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Admin gear icon */}
      <button
        onClick={() => setShowAdminLogin(true)}
        className="absolute right-6 top-6 rounded-full p-2 text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground"
        title="Admin Login"
      >
        <Settings className="h-5 w-5" />
      </button>

      {/* Version & update banner */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <span className="text-xs text-muted-foreground/50">v{appVersion}</span>
        {updateInfo && (
          <button
            onClick={() => window.open(updateInfo.releaseUrl, '_blank')}
            className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
          >
            <ArrowUpCircle className="h-3 w-3" />
            Update available: v{updateInfo.latestVersion}
          </button>
        )}
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-primary">ServePOS</h1>
        <p className="mt-1 text-sm text-muted-foreground">Enter your PIN to continue</p>
      </div>

      {/* PIN dots */}
      <div className="mb-6 flex gap-3">
        {Array.from({ length: maxPinLength }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-all ${
              i < pin.length
                ? 'scale-110 border-primary bg-primary'
                : 'border-muted-foreground/30 bg-transparent'
            }`}
          />
        ))}
      </div>

      {error && <p className="mb-4 text-sm font-medium text-destructive">{error}</p>}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3">
        {numpadKeys.flat().map((key) => {
          if (key === 'backspace') {
            return (
              <button
                key={key}
                onClick={handleBackspace}
                className="flex h-16 w-20 items-center justify-center rounded-xl bg-white text-lg font-medium shadow-sm transition-all hover:bg-gray-50 active:scale-95 active:bg-gray-100"
              >
                ←
              </button>
            )
          }
          if (key === 'enter') {
            return (
              <button
                key={key}
                onClick={handleSubmit}
                className="flex h-16 w-20 items-center justify-center rounded-xl bg-primary text-lg font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95"
              >
                ↵
              </button>
            )
          }
          return (
            <button
              key={key}
              onClick={() => handlePinInput(key)}
              className="flex h-16 w-20 items-center justify-center rounded-xl bg-white text-2xl font-semibold shadow-sm transition-all hover:bg-gray-50 active:scale-95 active:bg-gray-100"
            >
              {key}
            </button>
          )
        })}
      </div>

      {/* Admin login modal */}
      {showAdminLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-xl font-bold">Admin Login</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">
                  Username
                </label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-muted-foreground">
                  Password
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                />
              </div>

              {adminError && <p className="text-sm text-destructive">{adminError}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setShowAdminLogin(false)
                    setAdminUsername('')
                    setAdminPassword('')
                    setAdminError('')
                  }}
                  className="flex-1 rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdminLogin}
                  className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Login
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
