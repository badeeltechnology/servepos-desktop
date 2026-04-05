import { create } from 'zustand'

interface User {
  id: string
  name: string
  full_name: string | null
  role: 'supervisor' | 'cashier' | 'coordinator'
  max_discount_pct: number
}

interface AuthState {
  user: User | null
  isAdminMode: boolean
  lastActivity: number
  setUser: (user: User | null) => void
  setAdminMode: (isAdmin: boolean) => void
  updateActivity: () => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAdminMode: false,
  lastActivity: Date.now(),
  setUser: (user) => set({ user, lastActivity: Date.now() }),
  setAdminMode: (isAdminMode) => set({ isAdminMode }),
  updateActivity: () => set({ lastActivity: Date.now() }),
  logout: () => set({ user: null, isAdminMode: false })
}))
