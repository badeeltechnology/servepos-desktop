import { useState } from 'react'

interface FullKeyboardProps {
  onKey: (key: string) => void
  onDone?: () => void
  className?: string
}

const ROWS_LOWER = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
  ['symbols', ' ', 'done']
]

const ROWS_UPPER = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'backspace'],
  ['symbols', ' ', 'done']
]

const ROWS_SYMBOLS = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
  ['-', '_', '=', '+', '[', ']', '{', '}', '|', '\\'],
  [':', ';', '"', "'", ',', '.', '<', '>', '/'],
  ['abc', '~', '`', '?', '!', '@', '#', '$', 'backspace'],
  ['abc', ' ', 'done']
]

export default function FullKeyboard({ onKey, onDone, className = '' }: FullKeyboardProps) {
  const [shifted, setShifted] = useState(false)
  const [symbols, setSymbols] = useState(false)

  const rows = symbols ? ROWS_SYMBOLS : shifted ? ROWS_UPPER : ROWS_LOWER

  function handleKey(key: string) {
    if (key === 'shift') {
      setShifted(!shifted)
      return
    }
    if (key === 'symbols') {
      setSymbols(true)
      return
    }
    if (key === 'abc') {
      setSymbols(false)
      return
    }
    if (key === 'done') {
      onKey('done')
      onDone?.()
      return
    }
    onKey(key)
    // Auto-unshift after typing a character
    if (shifted && key !== 'backspace' && key !== ' ') {
      setShifted(false)
    }
  }

  function getKeyLabel(key: string): string {
    if (key === 'backspace') return '\u232B'
    if (key === 'shift') return shifted ? '\u21E7' : '\u21E7'
    if (key === 'symbols') return '123'
    if (key === 'abc') return 'ABC'
    if (key === ' ') return 'Space'
    if (key === 'done') return 'Done'
    return key
  }

  function getKeyClass(key: string): string {
    const base = 'flex h-9 items-center justify-center rounded-lg text-sm font-medium transition-colors select-none'
    if (key === ' ') return `${base} flex-1 bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300`
    if (key === 'done') return `${base} min-w-[80px] bg-primary text-white hover:bg-primary/90 active:bg-primary/80`
    if (key === 'shift') return `${base} min-w-[60px] ${shifted ? 'bg-gray-300 text-gray-800' : 'bg-gray-100 text-gray-600'} hover:bg-gray-200 active:bg-gray-300`
    if (key === 'backspace') return `${base} min-w-[60px] bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300`
    if (key === 'symbols' || key === 'abc') return `${base} min-w-[60px] bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300`
    return `${base} flex-1 bg-gray-50 text-gray-800 hover:bg-gray-100 active:bg-gray-200`
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {rows.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1">
          {row.map((key, ki) => (
            <button
              key={ki}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleKey(key)}
              className={getKeyClass(key)}
            >
              {getKeyLabel(key)}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
