// The assistant on every page: a floating button, and the one chat drawer for the whole app.
// /map keeps its own buttons (they call openChat too); the officer console has no public chat.
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { closeChat, openChat, useChat } from '../lib/chat'
import { Icon } from './Icon'

const ChatDrawer = lazy(() => import('./ChatDrawer'))
const NO_BUTTON = new Set(['/map', '/officer'])

export function ChatLauncher({ path }: { path: string }) {
  const { t } = useTranslation()
  const { open, prompt } = useChat()
  if (path === '/officer') return null
  return (
    <>
      {!open && !NO_BUTTON.has(path) && (
        <button
          type="button"
          onClick={() => openChat()}
          className="fixed right-4 bottom-4 z-40 inline-flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-[#c2410c] text-lg font-bold text-white shadow-[0_12px_30px_-8px_rgb(194_65_12/0.7)] transition-transform hover:-translate-y-0.5 hover:bg-[#9a3412] sm:right-6 sm:bottom-6 sm:px-5"
        >
          <Icon name="chat" size={26} />
          <span className="sr-only sm:not-sr-only">{t('chat.fab')}</span>
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <ChatDrawer onClose={closeChat} prompt={prompt} />
        </Suspense>
      )}
    </>
  )
}
