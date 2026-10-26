import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { currencyCode, getMoneyDecimals, roundMoney } from '../ui/currency'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, symbol = currencyCode(), position = 'after', decimals = getMoneyDecimals()): string {
  const formatted = roundMoney(amount, decimals).toFixed(decimals)
  if (position === 'before') {
    return `${symbol} ${formatted}`
  }
  return `${formatted} ${symbol}`
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
