// Nami design-system primitives shared by every screen.
// Tokens live in tailwind.config.js under `n-*`; this file turns them into components.
import { ReactNode, useEffect, useState, ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '../lib/utils'
import { useT } from '../stores/i18n'

export const C = {
  deep: '#0B3B49', rail: '#0E4A5B', cream: '#F4EFE6', amber: '#F4A52A', teal: '#0E6E86', red: '#C83E2E',
  line: '#E6E1D6', muted: '#7A7F85', ink: '#1B1F24', green: '#2E8B57', lamp: '#5FD38D', stone: '#9A958A',
  mist: '#9DBAC3', hold: '#8B6F5C', fresh: '#9ED6E6'
}

/** Category / staff colour palette from the mockups. */
export const PALETTE = ['#0E6E86', '#8B5A2B', '#D9A441', '#C25B8C', '#E8792B', '#2E9E7A', '#7C5CBF', '#8E3B6E', '#D9548A', '#5DAACB', '#B98B3C', '#A0522D', '#6E9F3A', '#3F7FD1', '#6B8E23', '#C47AB8', '#555B61']
const STAFF = ['#0E6E86', '#2E9E7A', '#7C5CBF', '#C2662B', '#D9548A', '#555B61', '#B98B3C', '#3F7FD1']

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
export function staffColor(name?: string | null) {
  if (!name) return C.stone
  return STAFF[hash(name) % STAFF.length]
}
export function initial(name?: string | null) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

// One money formatter for the whole renderer. Decimals come from the receipt config
// (currency_decimals) once loaded; the currency symbol is shown next to totals via useStatus.
let MONEY_DECIMALS = 2
export function setMoneyDecimals(d: number) { if (Number.isFinite(d) && d >= 0 && d <= 4) MONEY_DECIMALS = d }
export function money(n: number | null | undefined, decimals = MONEY_DECIMALS) {
  const v = Number(n) || 0
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Window width, updated on resize. Layout tiers: <1280 compact (1024), >=1280 wide (1366), >=1800 large (1920). */
export function useViewportWidth() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const h = () => setW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return w
}
export function useTier() {
  const w = useViewportWidth()
  return { w, wide: w >= 1280, large: w >= 1800 }
}

// ---------------------------------------------------------------- Button
type Variant = 'amber' | 'deep' | 'teal' | 'outline' | 'ghostDark' | 'danger' | 'dangerOutline' | 'white' | 'rail' | 'plain' | 'green'
type Size = 'sm' | 'md' | 'lg' | 'xl'
const VARIANTS: Record<Variant, string> = {
  amber: 'bg-n-amber text-n-ink font-bold disabled:bg-n-sand disabled:text-n-stone',
  deep: 'bg-n-deep text-white disabled:bg-n-sand disabled:text-n-stone',
  teal: 'bg-n-teal text-white disabled:bg-n-sand disabled:text-n-stone',
  green: 'bg-n-green text-white disabled:bg-n-sand disabled:text-n-stone',
  outline: 'border-[1.5px] border-n-edge bg-white text-n-ink disabled:text-n-stone',
  ghostDark: 'border-[1.5px] border-n-steel bg-transparent text-white disabled:opacity-50',
  danger: 'bg-n-red text-white disabled:bg-n-sand disabled:text-n-stone',
  dangerOutline: 'border border-n-red bg-white text-n-red disabled:opacity-50',
  white: 'bg-white text-n-deep disabled:opacity-60',
  rail: 'bg-n-deep text-white disabled:opacity-60',
  plain: 'bg-transparent text-n-teal'
}
const SIZES: Record<Size, string> = {
  sm: 'h-10 px-3 text-[13px]',
  md: 'h-11 px-3.5 text-sm',
  lg: 'h-14 px-5 text-[15px]',
  xl: 'h-16 px-[18px] text-base'
}

export interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}
export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn({ variant = 'outline', size = 'md', className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn('press inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold', VARIANTS[variant], SIZES[size], className)}
      {...rest}
    />
  )
})

// ---------------------------------------------------------------- Text helpers
export function Cap({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('cap', className)}>{children}</span>
}
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('cond num', className)}>{children}</span>
}

// ---------------------------------------------------------------- Lamps
export type LampTone = 'ok' | 'warn' | 'bad' | 'off' | 'info'
const LAMP: Record<LampTone, string> = { ok: '#5FD38D', warn: '#F4A52A', bad: '#FF8A7A', off: '#9DBAC3', info: '#3CC2BE' }
export function Lamp({ tone, label, strong, onClick, title }: { tone: LampTone; label: ReactNode; strong?: boolean; onClick?: () => void; title?: string }) {
  const content = (
    <>
      <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ background: LAMP[tone] }} />
      {label}
    </>
  )
  const cls = cn('flex h-10 items-center gap-[7px] whitespace-nowrap px-1 text-[13px]', strong ? 'font-semibold text-n-gold' : tone === 'bad' ? 'font-semibold text-n-coral' : 'text-n-frost')
  if (!onClick) return <span className={cls} title={title}>{content}</span>
  return (
    <button type="button" onClick={onClick} className={cls} title={title}>
      {content}
    </button>
  )
}
export function Dot({ color, size = 8, square }: { color: string; size?: number; square?: boolean }) {
  return <span className="inline-block flex-shrink-0" style={{ width: size, height: size, borderRadius: square ? 2 : size / 2, background: color }} />
}

// ---------------------------------------------------------------- Overlays
/** Overlays end where the on-screen keyboard starts (KeyboardProvider sets --kb), so a dialog's
 *  field and its Save button stay visible while typing. */
const ABOVE_KEYBOARD: React.CSSProperties = { bottom: 'var(--kb, 0px)', transition: 'bottom 120ms ease-out' }

export function Dialog({ onClose, children, className, label, dismissable = true }: { onClose?: () => void; children: ReactNode; className?: string; label?: string; dismissable?: boolean }) {
  useEffect(() => {
    if (!onClose || !dismissable) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, dismissable])
  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center bg-[rgba(11,59,73,.6)] p-4" style={ABOVE_KEYBOARD} onMouseDown={(e) => { if (e.target === e.currentTarget && dismissable) onClose?.() }}>
      <div role="dialog" aria-modal="true" aria-label={label} className={cn('flex max-h-full max-w-full animate-rise flex-col overflow-y-auto bg-n-cream shadow-pop', className)}>
        {children}
      </div>
    </div>
  )
}

/** Side drawer, slides in from the right over the till. */
export function Sheet({ onClose, children, className, label }: { onClose: () => void; children: ReactNode; className?: string; label?: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-x-0 top-0 z-40 flex justify-end bg-[rgba(11,59,73,.45)]" style={ABOVE_KEYBOARD} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <aside role="dialog" aria-label={label} className={cn('flex h-full animate-slidein flex-col bg-n-cream shadow-pop', className)}>
        {children}
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------- Choice controls
/** Rounded filter pill, 44px. */
export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cn('press flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-white px-3.5 text-[13px]', active ? 'border-2 border-n-deep font-semibold' : 'border border-[#E0D9CB]', className)}
    >
      {children}
    </button>
  )
}

/** Square option button used in modifiers, void reasons, receipt choices. */
export function Option({ active, onClick, children, className, disabled }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      disabled={disabled}
      onClick={onClick}
      className={cn('press flex h-12 items-center justify-between gap-2 rounded-md bg-white px-3 text-start text-sm disabled:opacity-40', active ? 'border-2 border-n-deep font-semibold' : 'border border-n-edge', className)}
    >
      {children}
    </button>
  )
}

/** Dark segmented tabs on the rail (Open orders, Coordinator). */
export function RailTab({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={!!active} onClick={onClick}
      className={cn('press flex h-11 items-center gap-[7px] whitespace-nowrap rounded-md px-3 text-sm', active ? 'bg-white font-semibold text-n-deep' : 'bg-transparent text-white')}>
      {children}
    </button>
  )
}

export function Stepper({ value, onDec, onInc, decLabel = 'One less', incLabel = 'One more', size = 44, className, valueClass }: { value: ReactNode; onDec: () => void; onInc: () => void; decLabel?: string; incLabel?: string; size?: number; className?: string; valueClass?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5', className)}>
      <button type="button" aria-label={decLabel} onClick={onDec} className="press flex items-center justify-center rounded-md border border-n-edge bg-white text-xl" style={{ width: size, height: size }}>−</button>
      <span className={cn('cond num min-w-[36px] text-center text-[28px] font-bold', valueClass)}>{value}</span>
      <button type="button" aria-label={incLabel} onClick={onInc} className="press flex items-center justify-center rounded-md border border-n-edge bg-white text-xl" style={{ width: size, height: size }}>+</button>
    </span>
  )
}

// ---------------------------------------------------------------- Keypad
export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'C' | 'back'
export function Keypad({ onKey, mode = 'pin', tone = 'dark', className, keyClass }: { onKey: (k: KeypadKey) => void; mode?: 'pin' | 'decimal'; tone?: 'dark' | 'light' | 'deep'; className?: string; keyClass?: string }) {
  const keys: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', mode === 'pin' ? 'C' : '.', '0', 'back']
  const toneCls = tone === 'light' ? 'bg-white text-n-ink shadow-keydeep' : tone === 'deep' ? 'bg-n-deep text-white' : 'bg-n-rail text-white'
  return (
    <div dir="ltr" className={cn('grid grid-cols-3 grid-rows-4 gap-2', className)}>
      {keys.map((k) => (
        <button key={k} type="button" aria-label={k === 'back' ? 'Delete' : k === 'C' ? 'Clear' : k}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onKey(k)}
          className={cn('press cond num flex min-h-[44px] items-center justify-center rounded-md text-[30px] font-semibold', toneCls, keyClass)}>
          {k === 'back' ? <BackspaceIcon /> : k}
        </button>
      ))}
    </div>
  )
}
export function BackspaceIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 5H9l-7 7 7 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
      <path d="m17 9-6 6M11 9l6 6" />
    </svg>
  )
}
/** Applies a keypad key to a PIN string. */
export function pinKey(pin: string, k: KeypadKey, max = 8) {
  if (k === 'back') return pin.slice(0, -1)
  if (k === 'C') return ''
  if (k === '.') return pin
  return pin.length >= max ? pin : pin + k
}
/** Applies a keypad key to a money entry string. */
export function amountKey(v: string, k: KeypadKey) {
  if (k === 'back') return v.slice(0, -1)
  if (k === 'C') return ''
  if (k === '.') return v.includes('.') ? v : (v || '0') + '.'
  const dot = v.indexOf('.')
  if (dot >= 0 && v.length - dot > 2) return v
  if (v.length >= 9) return v
  return v === '0' ? k : v + k
}

export function PinDots({ count, filled, size = 16, tone = 'dark' }: { count: number; filled: number; size?: number; tone?: 'dark' | 'light' }) {
  return (
    <div className="flex h-10 items-center justify-center gap-3.5">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="rounded-full" style={{
          width: size, height: size,
          ...(i < filled ? { background: C.amber } : { border: `2px solid ${tone === 'dark' ? '#4E8292' : '#CBC5B8'}` })
        }} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Bars
export function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const t = useT()
  return (
    <button type="button" onClick={onClick} className="press flex h-11 items-center gap-1.5 whitespace-nowrap rounded-md bg-n-deep pl-2 pr-3 text-sm font-semibold text-white">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:rotate-180"><path d="M15 18l-6-6 6-6" /></svg>
      {label ?? t('Back')}
    </button>
  )
}

/** The 56px teal bar under the status band on full-screen views. */
export function SubBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex h-14 flex-shrink-0 items-center gap-3 bg-n-rail px-2 text-white', className)}>{children}</div>
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-md bg-white shadow-tile', className)}>{children}</div>
}

export function Chevron({ dir = 'down', size = 12, className, strokeWidth = 3 }: { dir?: 'down' | 'right' | 'up' | 'left'; size?: number; className?: string; strokeWidth?: number }) {
  const d = { down: 'm6 9 6 6 6-6', right: 'm9 6 6 6-6 6', up: 'm6 15 6-6 6 6', left: 'M15 18l-6-6 6-6' }[dir]
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={d} /></svg>
}

export function SearchIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
}

/** A field label + value row used in summaries. */
export function Row({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <span className={cn('flex items-baseline justify-between gap-3', className)}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </span>
  )
}

/** Plain text input styled for the cream surface. Pass data-keyboard to get the on-screen keyboard. */
export const Field = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { 'data-keyboard'?: string }>(function Field({ className, ...rest }, ref) {
  return <input ref={ref} className={cn('h-12 w-full rounded-md border border-n-edge bg-white px-3 text-[15px] text-n-ink placeholder:text-n-muted focus:border-2 focus:border-n-teal focus:outline-none', className)} {...rest} />
})
