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
    <div className={className}>
      <div className="grid grid-cols-3 gap-2">
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
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onKey('done')}
        className="mt-2 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-white transition-colors hover:bg-primary/90 active:bg-primary/80 select-none"
      >
        Done
      </button>
    </div>
  )
}
