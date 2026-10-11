// One chat drawer for the whole app: any page (or the live warning banner) can open it, optionally
// with a question already typed in for the user to send.
import { useSyncExternalStore } from 'react'

interface ChatState {
  open: boolean
  prompt: string | null
}

let state: ChatState = { open: false, prompt: null }
const listeners = new Set<() => void>()

function set(next: ChatState) {
  state = next
  listeners.forEach((l) => l())
}

export function openChat(prompt?: string): void {
  set({ open: true, prompt: prompt ?? null })
}

export function closeChat(): void {
  set({ open: false, prompt: null })
}

export function useChat(): ChatState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
