import { create } from 'zustand'

interface AppState {
  isOnline: boolean
  syncStatus: 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  setOnline: (online: boolean) => void
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void
  setLastSyncAt: (date: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  isOnline: navigator.onLine,
  syncStatus: 'idle',
  lastSyncAt: null,
  setOnline: (isOnline) => set({ isOnline }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt })
}))

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useAppStore.getState().setOnline(true))
  window.addEventListener('offline', () => useAppStore.getState().setOnline(false))
}
