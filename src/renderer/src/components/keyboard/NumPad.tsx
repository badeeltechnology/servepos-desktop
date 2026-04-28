interface NumPadProps {
  onKey: (key: string) => void
  showDecimal?: boolean
  className?: string
}

export default function NumPad({ onKey, showDecimal = true, className = '' }: NumPadProps) {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [showDecimal ? '.' : '', '0', 'backspace']
  ]

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {keys.flat().map((key, i) => {
        if (key === '') {
          return <div key={i} />
        }
        return (
          <button
            key={i}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onKey(key)}
            className="flex h-14 items-center justify-center rounded-xl bg-gray-50 text-lg font-semibold text-gray-800 transition-colors hover:bg-gray-100 active:bg-gray-200 select-none"
          >
            {key === 'backspace' ? '\u232B' : key}
          </button>
        )
      })}
    </div>
  )
}
