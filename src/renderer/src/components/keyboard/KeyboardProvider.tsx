import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import NumPad from './NumPad'
import FullKeyboard from './FullKeyboard'

type KeyboardType = 'numpad' | 'full' | null

interface KeyboardContextValue {
  activeKeyboard: KeyboardType
}

const KeyboardContext = createContext<KeyboardContextValue>({ activeKeyboard: null })

export function useKeyboard() {
  return useContext(KeyboardContext)
}

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const [keyboardType, setKeyboardType] = useState<KeyboardType>(null)
  const [numpadPos, setNumpadPos] = useState<{ top: number; left: number } | null>(null)
  const activeInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const keyboardRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null)

  const hideKeyboard = useCallback(() => {
    if (activeInputRef.current) {
      // Remove inputMode override
      activeInputRef.current.removeAttribute('inputMode')
    }
    activeInputRef.current = null
    setKeyboardType(null)
  }, [])

  useEffect(() => {
    function handleFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement
      if (!target) return

      const tag = target.tagName
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return

      const input = target as HTMLInputElement | HTMLTextAreaElement
      const kbType = input.getAttribute('data-keyboard') as KeyboardType

      if (!kbType) {
        // No data-keyboard attribute — don't show on-screen keyboard
        if (activeInputRef.current && activeInputRef.current !== input) {
          hideKeyboard()
        }
        return
      }

      activeInputRef.current = input
      setKeyboardType(kbType)
      // Suppress OS virtual keyboard after showing our keyboard
      requestAnimationFrame(() => {
        input.setAttribute('inputMode', 'none')
      })

      if (kbType === 'numpad') {
        // Position floating numpad near the input
        requestAnimationFrame(() => {
          const rect = input.getBoundingClientRect()
          const padW = 240
          const padH = 280
          let top = rect.bottom + 8
          let left = rect.left + rect.width / 2 - padW / 2
          // Keep within viewport
          if (top + padH > window.innerHeight) top = rect.top - padH - 8
          if (left < 8) left = 8
          if (left + padW > window.innerWidth - 8) left = window.innerWidth - padW - 8
          setNumpadPos({ top, left })
        })
      } else {
        setNumpadPos(null)
        // Scroll input into view above the docked keyboard
        requestAnimationFrame(() => {
          const rect = input.getBoundingClientRect()
          if (rect.bottom > window.innerHeight - 220) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        })
      }
    }

    function handleFocusOut(e: FocusEvent) {
      // Delay to allow click on keyboard buttons to register
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null
        // If focus moved to keyboard area, don't hide
        if (keyboardRef.current && active && keyboardRef.current.contains(active)) {
          return
        }
        // If focus moved to another data-keyboard input, the focusin handler will take care of it
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.getAttribute('data-keyboard')) {
          return
        }
        hideKeyboard()
      }, 100)
    }

    function handleClickOutside(e: MouseEvent) {
      if (!activeInputRef.current || !keyboardType) return

      const target = e.target as HTMLElement
      // Click inside keyboard
      if (keyboardRef.current && keyboardRef.current.contains(target)) return
      // Click on the active input
      if (activeInputRef.current.contains(target)) return
      // Click on another data-keyboard input — let focusin handle it
      if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target.getAttribute('data-keyboard')) return

      hideKeyboard()
    }

    document.addEventListener('focusin', handleFocusIn, true)
    document.addEventListener('focusout', handleFocusOut, true)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true)
      document.removeEventListener('focusout', handleFocusOut, true)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [keyboardType, hideKeyboard])

  function handleKey(key: string) {
    const input = activeInputRef.current
    if (!input) return

    if (key === 'done' || key === 'enter') {
      input.blur()
      hideKeyboard()
      return
    }

    const currentValue = input.value
    const selStart = input.selectionStart ?? currentValue.length
    const selEnd = input.selectionEnd ?? currentValue.length
    let newValue: string

    if (key === 'backspace') {
      if (selStart !== selEnd) {
        // Delete selection
        newValue = currentValue.slice(0, selStart) + currentValue.slice(selEnd)
      } else if (selStart > 0) {
        newValue = currentValue.slice(0, selStart - 1) + currentValue.slice(selStart)
      } else {
        return
      }
    } else {
      newValue = currentValue.slice(0, selStart) + key + currentValue.slice(selEnd)
    }

    // Use native setter for React compatibility
    const isTextArea = input.tagName === 'TEXTAREA'
    const proto = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (nativeSetter) {
      nativeSetter.call(input, newValue)
    } else {
      input.value = newValue
    }

    input.dispatchEvent(new Event('input', { bubbles: true }))

    // Restore cursor position
    const newCursorPos = key === 'backspace'
      ? (selStart !== selEnd ? selStart : Math.max(0, selStart - 1))
      : selStart + key.length

    requestAnimationFrame(() => {
      input.setSelectionRange(newCursorPos, newCursorPos)
    })
  }

  function handleDragStart(e: React.MouseEvent | React.TouchEvent) {
    if (!numpadPos) return
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    dragState.current = { startX: clientX, startY: clientY, origLeft: numpadPos.left, origTop: numpadPos.top }

    function onMove(ev: MouseEvent | TouchEvent) {
      if (!dragState.current) return
      const cx = 'touches' in ev ? ev.touches[0].clientX : ev.clientX
      const cy = 'touches' in ev ? ev.touches[0].clientY : ev.clientY
      const dx = cx - dragState.current.startX
      const dy = cy - dragState.current.startY
      setNumpadPos({
        left: Math.max(0, Math.min(window.innerWidth - 240, dragState.current.origLeft + dx)),
        top: Math.max(0, Math.min(window.innerHeight - 100, dragState.current.origTop + dy))
      })
    }

    function onEnd() {
      dragState.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onEnd)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onEnd)
    document.addEventListener('touchmove', onMove)
    document.addEventListener('touchend', onEnd)
  }

  const keyboard = keyboardType && createPortal(
    keyboardType === 'numpad' && numpadPos ? (
      <div
        ref={keyboardRef}
        className="fixed z-[9999] rounded-md bg-n-cream shadow-pop"
        style={{ top: numpadPos.top, left: numpadPos.left, width: 240 }}
        onMouseDown={(e) => { if ((e.target as HTMLElement).closest('[data-drag-handle]')) return; e.preventDefault() }}
      >
        <div
          data-drag-handle
          className="flex cursor-grab items-center justify-center rounded-t-md bg-n-sand py-2 active:cursor-grabbing"
          onMouseDown={(e) => { e.preventDefault(); handleDragStart(e) }}
          onTouchStart={handleDragStart}
        >
          <div className="h-1 w-10 rounded-full bg-n-stone" />
        </div>
        <div className="p-3 pt-2">
          <NumPad onKey={handleKey} />
        </div>
      </div>
    ) : (
      <div
        ref={keyboardRef}
        className="fixed bottom-0 left-0 right-0 z-[9999] bg-n-sand shadow-[0_-4px_20px_rgba(0,0,0,0.15)]"
        onMouseDown={(e) => e.preventDefault()}
      >
        <div className="mx-auto max-w-[1100px] p-2">
          <FullKeyboard onKey={handleKey} onDone={() => { handleKey('done') }} />
        </div>
      </div>
    ),
    document.body
  )

  return (
    <KeyboardContext.Provider value={{ activeKeyboard: keyboardType }}>
      {children}
      {keyboard}
    </KeyboardContext.Provider>
  )
}
