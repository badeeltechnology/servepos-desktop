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
    const base = 'press flex h-12 min-w-0 items-center justify-center rounded-md text-[17px] text-n-ink shadow-key select-none'
    if (key === ' ') return `${base} flex-[5] bg-white text-sm text-n-muted`
    if (key === 'done') return `${base} flex-[2] bg-n-deep text-[15px] font-semibold text-white`
    if (key === 'shift') return `${base} flex-[1.3] ${shifted ? 'bg-n-deep text-white' : 'bg-[#CFC7B8]'}`
    if (key === 'backspace') return `${base} flex-[1.3] bg-[#CFC7B8]`
    if (key === 'symbols' || key === 'abc') return `${base} flex-[1.3] bg-[#CFC7B8] text-sm`
    return `${base} flex-1 bg-white`
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {rows.map((row, ri) => (
        <div key={ri} className="flex justify-center gap-1.5">
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
