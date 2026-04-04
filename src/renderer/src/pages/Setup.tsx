import { useState } from 'react'
import { ChevronRight, ChevronLeft, Check, Loader2, Wifi, WifiOff } from 'lucide-react'

interface SetupProps {
  onComplete: () => void
}

type Step = 'admin' | 'connection' | 'settings' | 'supervisor' | 'done'

export default function Setup({ onComplete }: SetupProps) {
  const [step, setStep] = useState<Step>('admin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Admin account
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('')

  // ERPNext connection
  const [erpnextUrl, setErpnextUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [connectionVerified, setConnectionVerified] = useState(false)

  // Profile selection (will be populated from ERPNext)
  const [companies, setCompanies] = useState<string[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [profiles, setProfiles] = useState<string[]>([])
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [selectedProfile, setSelectedProfile] = useState('')

  // Settings
  const [branchCode, setBranchCode] = useState('')
  const [terminalNumber, setTerminalNumber] = useState('T01')
  const [syncInterval, setSyncInterval] = useState('5')
  const [inactivityTimeout, setInactivityTimeout] = useState('10')

  // Supervisor
  const [supervisorName, setSupervisorName] = useState('')
  const [supervisorPin, setSupervisorPin] = useState('')
  const [supervisorPinConfirm, setSupervisorPinConfirm] = useState('')

  const steps: { key: Step; label: string }[] = [
    { key: 'admin', label: 'Admin Account' },
    { key: 'connection', label: 'ERPNext & Profile' },
    { key: 'settings', label: 'Settings' },
    { key: 'supervisor', label: 'Supervisor' },
    { key: 'done', label: 'Complete' }
  ]

  const currentStepIndex = steps.findIndex((s) => s.key === step)

  async function handleCreateAdmin() {
    setError('')
    if (!adminUsername.trim()) { setError('Username is required'); return }
    if (adminPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    if (adminPassword !== adminPasswordConfirm) { setError('Passwords do not match'); return }

    try {
      setLoading(true)
      // Skip creation if admin already exists (user went back and forward)
      const exists = await window.api.admin.exists()
      if (!exists) {
        await window.api.admin.create(adminUsername.trim(), adminPassword)
      }
      setStep('connection')
    } catch (err: any) {
      setError(err.message || 'Failed to create admin account')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyConnection() {
    setError('')
    if (!erpnextUrl.trim()) { setError('ERPNext URL is required'); return }
    if (!apiKey.trim()) { setError('API Key is required'); return }
    if (!apiSecret.trim()) { setError('API Secret is required'); return }

    try {
      setLoading(true)
      await window.api.config.set('erpnext_url', erpnextUrl.trim().replace(/\/+$/, ''))
      await window.api.config.set('api_key', apiKey.trim())
      await window.api.config.set('api_secret', apiSecret.trim())

      const testResult = await window.api.sync.testConnection()
      if (!testResult.success) {
        await window.api.config.set('erpnext_url', '')
        await window.api.config.set('api_key', '')
        await window.api.config.set('api_secret', '')
        setError(`Connection failed: ${testResult.error || 'Invalid credentials'}. Please check URL and API Key/Secret.`)
        return
      }

      setConnectionVerified(true)

      const fetchedCompanies = await window.api.sync.getCompanies()
      if (fetchedCompanies.length === 0) {
        setError('No companies found in ERPNext. Please create a company first.')
        return
      }
      setCompanies(fetchedCompanies)
      if (fetchedCompanies.length === 1) setSelectedCompany(fetchedCompanies[0])

      const fetchedProfiles = await window.api.sync.getPosProfiles()
      if (fetchedProfiles.length === 0) {
        setError('No POS Profiles found in ERPNext. Please create a POS Profile first.')
        return
      }
      const profileNames = fetchedProfiles.map((p: any) => p.name)
      setProfiles(profileNames)
      if (profileNames.length === 1) setSelectedProfile(profileNames[0])
    } catch (err: any) {
      setError(err.message || 'Failed to verify connection')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveConnectionAndProfile() {
    setError('')
    if (!selectedCompany) { setError('Please select a company'); return }
    if (!selectedProfile) { setError('Please select a POS Profile'); return }

    await window.api.config.set('company', selectedCompany)
    await window.api.config.set('pos_profile', selectedProfile)

    // Run initial sync
    try {
      setLoading(true)
      await window.api.sync.run()
    } catch { /* non-blocking */ } finally {
      setLoading(false)
    }

    setStep('settings')
  }

  async function handleSaveSettings() {
    setError('')
    if (!branchCode.trim()) { setError('Branch code is required'); return }
    if (!terminalNumber.trim()) { setError('Terminal number is required'); return }

    await window.api.config.set('branch_code', branchCode.trim().toUpperCase())
    await window.api.config.set('terminal_number', terminalNumber.trim().toUpperCase())
    await window.api.config.set('auto_sync_interval', syncInterval)
    await window.api.config.set('inactivity_timeout', inactivityTimeout)
    setStep('supervisor')
  }

  async function handleCreateSupervisor() {
    setError('')
    if (!supervisorName.trim()) { setError('Supervisor name is required'); return }
    if (supervisorPin.length < 6 || supervisorPin.length > 8) { setError('PIN must be 6-8 digits'); return }
    if (!/^\d+$/.test(supervisorPin)) { setError('PIN must contain only numbers'); return }
    if (supervisorPin !== supervisorPinConfirm) { setError('PINs do not match'); return }

    try {
      setLoading(true)
      await window.api.users.create(supervisorName.trim(), supervisorPin, 'supervisor')
      setStep('done')
    } catch (err: any) {
      setError(err.message || 'Failed to create supervisor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Sidebar - Steps */}
      <div className="flex w-72 flex-col border-r border-white/50 bg-white/30 p-8 backdrop-blur-sm">
        <h1 className="mb-2 text-2xl font-bold text-primary">ServePOS</h1>
        <p className="mb-8 text-sm text-muted-foreground">Initial Setup</p>

        <nav className="space-y-2">
          {steps.map((s, i) => (
            <div
              key={s.key}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                i === currentStepIndex
                  ? 'bg-primary/10 font-medium text-primary'
                  : i < currentStepIndex
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground/50'
              }`}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  i < currentStepIndex
                    ? 'bg-primary text-primary-foreground'
                    : i === currentStepIndex
                      ? 'border-2 border-primary text-primary'
                      : 'border border-muted-foreground/30 text-muted-foreground/50'
                }`}
              >
                {i < currentStepIndex ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              {s.label}
            </div>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-lg">
          {/* Step 1: Admin Account */}
          {step === 'admin' && (
            <div className="rounded-2xl bg-white p-8 shadow-lg">
              <h2 className="mb-1 text-2xl font-bold">Create Admin Account</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                This account is used for system configuration only.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Username</label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="admin"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Password</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Min 6 characters"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Confirm Password</label>
                  <input
                    type="password"
                    value={adminPasswordConfirm}
                    onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateAdmin()}
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <button
                  onClick={handleCreateAdmin}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: ERPNext Connection */}
          {step === 'connection' && (
            <div className="rounded-2xl bg-white p-8 shadow-lg">
              <h2 className="mb-1 text-2xl font-bold">ERPNext Connection</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Connect to your ERPNext server, then select company and POS profile.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">ERPNext URL</label>
                  <input type="url" value={erpnextUrl}
                    onChange={(e) => { setErpnextUrl(e.target.value); setConnectionVerified(false) }}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="https://erp.example.com" autoFocus disabled={connectionVerified} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">API Key</label>
                  <input type="text" value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setConnectionVerified(false) }}
                    className="w-full rounded-lg border border-input px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter API Key" disabled={connectionVerified} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">API Secret</label>
                  <input type="password" value={apiSecret}
                    onChange={(e) => { setApiSecret(e.target.value); setConnectionVerified(false) }}
                    className="w-full rounded-lg border border-input px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Enter API Secret" disabled={connectionVerified} />
                </div>

                {/* Connection verified — show company & profile */}
                {connectionVerified && companies.length > 0 && (
                  <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                      <Wifi className="h-4 w-4" />
                      Connected to ERPNext
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">Company</label>
                        <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}
                          className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                          <option value="">Select Company...</option>
                          {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium">POS Profile</label>
                        <select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)}
                          className="w-full rounded-lg border border-input bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                          <option value="">Select POS Profile...</option>
                          {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Edit connection button when verified */}
                {connectionVerified && (
                  <button onClick={() => setConnectionVerified(false)}
                    className="text-xs text-primary hover:underline">
                    Change connection details
                  </button>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setStep('admin')}
                    className="flex items-center gap-1 rounded-lg border border-input px-4 py-2.5 text-sm font-medium hover:bg-muted">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </button>
                  {!connectionVerified ? (
                    <button onClick={handleVerifyConnection} disabled={loading}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Verify Connection
                    </button>
                  ) : (
                    <button onClick={handleSaveConnectionAndProfile} disabled={loading || !selectedCompany || !selectedProfile}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Continue
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Removed separate profile step — now merged into connection step */}

          {/* Step 3: Settings */}
          {/* Step 3: Settings */}
          {step === 'settings' && (
            <div className="rounded-2xl bg-white p-8 shadow-lg">
              <h2 className="mb-1 text-2xl font-bold">Terminal Settings</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Configure order numbering and sync preferences.
              </p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Branch Code</label>
                    <input
                      type="text"
                      value={branchCode}
                      onChange={(e) => setBranchCode(e.target.value.toUpperCase().slice(0, 5))}
                      className="w-full rounded-lg border border-input px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="OLV"
                      autoFocus
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Used in order numbers</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Terminal No.</label>
                    <input
                      type="text"
                      value={terminalNumber}
                      onChange={(e) => setTerminalNumber(e.target.value.toUpperCase().slice(0, 5))}
                      className="w-full rounded-lg border border-input px-3 py-2 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="T01"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Unique per terminal</p>
                  </div>
                </div>

                <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Order number preview:{' '}
                    <span className="font-mono font-medium text-foreground">
                      {branchCode || 'OLV'}-{terminalNumber || 'T01'}-20260403-0001
                    </span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Auto-sync Interval</label>
                    <select
                      value={syncInterval}
                      onChange={(e) => setSyncInterval(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="1">Every 1 minute</option>
                      <option value="2">Every 2 minutes</option>
                      <option value="5">Every 5 minutes</option>
                      <option value="10">Every 10 minutes</option>
                      <option value="15">Every 15 minutes</option>
                      <option value="30">Every 30 minutes</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Inactivity Timeout</label>
                    <select
                      value={inactivityTimeout}
                      onChange={(e) => setInactivityTimeout(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="5">5 minutes</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="0">Never</option>
                    </select>
                  </div>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep('connection')}
                    className="flex items-center gap-1 rounded-lg border border-input px-4 py-2.5 text-sm font-medium hover:bg-muted"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Create Supervisor */}
          {step === 'supervisor' && (
            <div className="rounded-2xl bg-white p-8 shadow-lg">
              <h2 className="mb-1 text-2xl font-bold">Create Supervisor</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                The supervisor manages daily operations — printers, modifiers, cashiers, and orders.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Supervisor Name</label>
                  <input
                    type="text"
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    className="w-full rounded-lg border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g., Ahmad"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">PIN (6-8 digits)</label>
                  <input
                    type="password"
                    value={supervisorPin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 8)
                      setSupervisorPin(val)
                    }}
                    className="w-full rounded-lg border border-input px-3 py-2 text-center font-mono text-lg tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="••••••"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Confirm PIN</label>
                  <input
                    type="password"
                    value={supervisorPinConfirm}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 8)
                      setSupervisorPinConfirm(val)
                    }}
                    className="w-full rounded-lg border border-input px-3 py-2 text-center font-mono text-lg tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary"
                    inputMode="numeric"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateSupervisor()}
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep('settings')}
                    className="flex items-center gap-1 rounded-lg border border-input px-4 py-2.5 text-sm font-medium hover:bg-muted"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </button>
                  <button
                    onClick={handleCreateSupervisor}
                    disabled={loading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Create & Finish Setup
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Done */}
          {step === 'done' && (
            <div className="rounded-2xl bg-white p-8 text-center shadow-lg">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="mb-2 text-2xl font-bold">Setup Complete!</h2>
              <p className="mb-6 text-muted-foreground">
                ServePOS is ready. The supervisor can now log in to configure printers, modifiers,
                and create cashier accounts.
              </p>
              <button
                onClick={onComplete}
                className="rounded-lg bg-primary px-8 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
