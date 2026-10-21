/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Readex Pro"', 'system-ui', 'sans-serif'],
        cond: ['"Barlow Condensed"', '"Readex Pro"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      colors: {
        // Nami design tokens (see docs/design). Prefixed "n-" so they never clash with
        // Tailwind's own palettes, which the admin screens still use.
        n: {
          deep: '#0B3B49', // status band, dark panels, selected state
          rail: '#0E4A5B', // order rail, category shelf, dark keys
          cream: '#F4EFE6', // working surface
          amber: '#F4A52A', // the primary action (Pay, Open shift, Close shift)
          teal: '#0E6E86', // Send, links, focus
          red: '#C83E2E', // void, remove, late
          line: '#E6E1D6', // hairlines on white
          muted: '#7A7F85', // secondary text
          ink: '#1B1F24', // body text
          edge: '#CBC5B8', // outlined button border
          sand: '#E3DCCF', // keyboard tray, disabled fill
          stone: '#9A958A', // disabled text, "not sent"
          steel: '#4E8292', // outline on dark
          mist: '#9DBAC3', // secondary text on dark
          frost: '#D8E6EA', // body text on dark
          green: '#2E8B57', // ready, done
          lamp: '#5FD38D', // healthy lamp on dark
          gold: '#FFD27A', // warning text on dark
          coral: '#FF8A7A', // late text on dark
          ice: '#EEF5F7', // selected line
          wash: '#EAF4EC', // ready ticket
          dim: '#1E5566' // dividers on deep
        },
        // Warm neutral scale so the (restyled, not redesigned) admin screens sit on the same palette.
        gray: {
          50: '#FAF8F4',
          100: '#F4EFE6',
          200: '#E6E1D6',
          300: '#CBC5B8',
          400: '#9A958A',
          500: '#7A7F85',
          600: '#5C6167',
          700: '#3E4349',
          800: '#2A2E33',
          900: '#1B1F24'
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))'
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 1px)',
        sm: 'calc(var(--radius) - 2px)'
      },
      boxShadow: {
        tile: '0 1px 2px rgba(60,45,20,.12)',
        pop: '0 20px 60px rgba(0,0,0,.45)',
        key: '0 1px 0 #B9B2A4',
        keydeep: '0 2px 0 #CBC5B8'
      },
      keyframes: {
        edited: {
          '0%,100%': { boxShadow: '0 0 0 3px #0E6E86' },
          '50%': { boxShadow: '0 0 0 3px rgba(14,110,134,.15)' }
        },
        slidein: { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        rise: { from: { transform: 'translateY(12px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } }
      },
      animation: {
        edited: 'edited 1.2s ease-in-out infinite',
        slidein: 'slidein .18s ease-out',
        rise: 'rise .16s ease-out'
      }
    }
  },
  plugins: []
}
