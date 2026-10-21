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
              className="press cond num flex h-14 items-center justify-center rounded-md bg-white text-[26px] font-semibold text-n-ink shadow-keydeep select-none"
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
        className="press mt-2 flex h-12 w-full items-center justify-center rounded-md bg-n-deep text-base font-semibold text-white select-none"
      >
        Done
      </button>
    </div>
  )
}
