import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, isAbort, putUpload } from '../api/client'
import { getReportStatus, postChat, postUploadUrl } from '../api/endpoints'
import { USE_MOCK, config } from '../config'
import { currentLang } from '../i18n'
import { geoErrorCode, getLocation, type Coords } from '../lib/geo'
import { resizeToJpeg } from '../lib/image'
import { useLiveSafety } from '../lib/liveSafety'
import { useSettings } from '../lib/settings'
import { getSessionId } from '../lib/storage'
import { formatDateTime } from '../lib/time'
import { Link } from '../router'
import { Icon } from './Icon'
import { Linkify } from './Linkify'
import { MockBanner } from './MockBanner'

type Msg =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'bot'; text: string; updatedAt: string | null }
  | { id: number; role: 'notice'; text: string; retry?: string }

type PhotoStep =
  | { step: 'closed' }
  | { step: 'locating' }
  | { step: 'ready'; coords: Coords }
  | { step: 'uploading' }
  | { step: 'checking' }

const apiReady = USE_MOCK || Boolean(config.apiUrl)
const POLL_EVERY_MS = 3000
const POLL_FOR_MS = 45_000

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

let nextId = 1

function verdictSummary(verdict: Record<string, unknown> | null, lang: string): string | null {
  if (!verdict) return null
  const pick = (k: string) => (typeof verdict[k] === 'string' && (verdict[k] as string).trim() ? (verdict[k] as string) : null)
  return lang === 'hi' ? pick('summary_hi') ?? pick('summary_en') ?? pick('summary') : pick('summary_en') ?? pick('summary_hi') ?? pick('summary')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Poll GET /reports/{id}/status every 3 s for up to 45 s, until it leaves "pending". */
async function pollStatus(id: string, alive: () => boolean): Promise<{ status: string; verdict: Record<string, unknown> | null }> {
  const deadline = Date.now() + POLL_FOR_MS
  let status = 'pending'
  let verdict: Record<string, unknown> | null = null
  while (alive() && Date.now() < deadline) {
    await sleep(POLL_EVERY_MS)
    try {
      const s = await getReportStatus(id)
      status = s.status
      verdict = s.verdict ?? null
      if (status !== 'pending') break
    } catch {
      /* transient: keep polling until the deadline */
    }
  }
  return { status, verdict }
}

export default function ChatDrawer({ onClose, prompt }: { onClose: () => void; prompt?: string | null }) {
  const { t } = useTranslation()
  const lang = currentLang()
  const { flags, shift } = useSettings()
  const live = useLiveSafety()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState(prompt ?? '')
  const [pending, setPending] = useState(false)
  const [shared, setCoords] = useState<Coords | null>(null)
  const coords = shared ?? live.coords   // a pin the user shared here wins over the live location
  const [locating, setLocating] = useState(false)
  const [photo, setPhoto] = useState<PhotoStep>({ step: 'closed' })
  const [note, setNote] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      alive.current = false
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending, photo])

  const push = (m: DistributiveOmit<Msg, 'id'>) => {
    if (!alive.current) return
    setMessages((prev) => [...prev, { ...m, id: nextId++ } as Msg])
  }

  async function send(text: string, isRetry = false) {
    const message = text.trim()
    if (!message || pending || !apiReady) return
    if (!isRetry) push({ role: 'user', text: message })
    setPending(true)
    try {
      const res = await postChat({
        session_id: getSessionId(),
        message,
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
        ...(flags.length ? { profile: flags } : {}),
        ...(shift ? { shift } : {}),
      })
      push({ role: 'bot', text: typeof res.reply === 'string' ? res.reply : '', updatedAt: res.data_updated_at ?? null })
    } catch (e) {
      const key = isAbort(e) ? 'chat.timeout' : e instanceof ApiError && e.status === 429 ? 'chat.rateLimited' : 'chat.error'
      push({ role: 'notice', text: t(key), retry: message })
    } finally {
      if (alive.current) setPending(false)
    }
  }

  function retry(m: Extract<Msg, { role: 'notice' }>) {
    if (!m.retry) return
    setMessages((prev) => prev.filter((x) => x.id !== m.id))
    void send(m.retry, true)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const v = input
    setInput('')
    void send(v)
  }

  async function shareLocation() {
    setLocating(true)
    try {
      const c = await getLocation()
      if (alive.current) setCoords(c)
    } catch (e) {
      const code = geoErrorCode(e)
      push({ role: 'notice', text: t(code === 'denied' ? 'chat.locationDenied' : code === 'unsupported' ? 'chat.locationUnsupported' : 'chat.locationUnavailable') })
    } finally {
      if (alive.current) setLocating(false)
    }
  }

  // ---- photo report ----
  async function startPhoto() {
    setPhoto({ step: 'locating' })
    try {
      const c = await getLocation()
      if (!alive.current) return
      setCoords(c)
      setPhoto({ step: 'ready', coords: c })
    } catch (e) {
      const code = geoErrorCode(e)
      push({ role: 'notice', text: t(code === 'denied' ? 'chat.locationDenied' : code === 'unsupported' ? 'chat.locationUnsupported' : 'chat.locationUnavailable') })
      setPhoto({ step: 'closed' })
    }
  }

  async function onFile(file: File | undefined, at: Coords) {
    if (!file) return
    setPhoto({ step: 'uploading' })
    let jpeg: Blob
    try {
      jpeg = await resizeToJpeg(file)
    } catch {
      push({ role: 'notice', text: t('photo.badFile') })
      setPhoto({ step: 'ready', coords: at })
      return
    }
    try {
      const trimmed = note.trim()
      const up = await postUploadUrl({ session_id: getSessionId(), lat: at.lat, lon: at.lon, ...(trimmed ? { note: trimmed } : {}) })
      await putUpload(up.upload_url, jpeg, up.content_type || 'image/jpeg')
      push({ role: 'user', text: t('photo.you') })
      setNote('')
      setPhoto({ step: 'checking' })
      const { status, verdict } = await pollStatus(up.report_id, () => alive.current)
      const key = `photo.verdict.${status}`
      const head = t(key, { defaultValue: t('photo.verdict.pending') })
      const summary = status !== 'pending' ? verdictSummary(verdict, currentLang()) : null
      push({ role: 'bot', text: summary ? `${head}\n${summary}` : head, updatedAt: null })
    } catch (e) {
      push({ role: 'notice', text: e instanceof ApiError && e.status === 429 ? t('chat.rateLimited') : t('photo.failed') })
    } finally {
      if (alive.current) setPhoto({ step: 'closed' })
    }
  }

  const quick = [
    { label: t('chat.quickHeat'), msg: t('chat.quickHeatMsg') },
    { label: t('chat.quickCooling'), msg: t('chat.quickCoolingMsg') },
    { label: t('chat.quickFlood'), msg: t('chat.quickFloodMsg') },
    { label: t('chat.quickCrew'), msg: t('chat.quickCrewMsg') },
    { label: t('chat.quickWater'), msg: t('chat.quickWaterMsg') },
  ]
  const busy = pending || photo.step === 'uploading' || photo.step === 'checking'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-title"
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-[440px]"
        onClick={(e) => e.stopPropagation()}
      >
        <MockBanner />
        <div className="flex shrink-0 items-center gap-2 bg-brand px-4 py-3 text-white">
          <Icon name="chat" size={22} />
          <h2 id="chat-title" className="flex-1 text-lg font-bold">
            {t('chat.title')}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-white/15" aria-label={t('chat.close')}>
            <Icon name="close" size={24} />
          </button>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas px-4 py-3" aria-live="polite" aria-relevant="additions">
          <p className="rounded-lg bg-white p-3 text-muted">
            {t('chat.intro')} <strong className="text-ink">{t('chat.emergency')}</strong>
          </p>
          <p className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[15px]">
            <Icon name="shield" size={18} className="shrink-0 text-brand" />
            <span className="flex-1">{flags.length ? t('chat.personalised', { count: flags.length }) : t('chat.notPersonalised')}</span>
            <Link href="/me" onClick={onClose} className="font-semibold text-brand underline">
              {flags.length ? t('chat.editProfile') : t('chat.setProfile')}
            </Link>
          </p>
          {!apiReady && <p className="rounded-lg border-2 border-[#c92a2a] bg-white p-3 font-semibold">{t('chat.notConfigured')}</p>}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="ms-10 rounded-lg rounded-br-none bg-brand px-3 py-2 whitespace-pre-wrap text-white">
                <span className="sr-only">{t('chat.you')}: </span>
                {m.text}
              </div>
            ) : m.role === 'bot' ? (
              <div key={m.id} className="me-6">
                <div className="rounded-lg rounded-bl-none border border-line bg-white px-3 py-2 break-words whitespace-pre-wrap">
                  <span className="sr-only">{t('chat.bot')}: </span>
                  <Linkify text={m.text} />
                </div>
                {m.updatedAt && <p className="mt-1 text-muted">{t('chat.dataUpdated', { time: formatDateTime(m.updatedAt, lang) })}</p>}
              </div>
            ) : (
              <div key={m.id} role="alert" className="rounded-lg border-2 border-[#e8590c] bg-[#fff4e6] px-3 py-2">
                <p>{m.text}</p>
                {m.retry && (
                  <button type="button" onClick={() => retry(m)} disabled={pending} className="mt-1 inline-flex min-h-11 items-center gap-2 font-semibold underline">
                    <Icon name="refresh" size={18} />
                    {t('chat.retry')}
                  </button>
                )}
              </div>
            ),
          )}
          {pending && (
            <div className="me-6 inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-muted" role="status">
              <span aria-hidden="true" className="flex gap-1 text-xl leading-none">
                <span className="typing-dot">•</span>
                <span className="typing-dot">•</span>
                <span className="typing-dot">•</span>
              </span>
              {t('chat.typing')}
            </div>
          )}
          {(photo.step === 'uploading' || photo.step === 'checking') && (
            <p className="me-6 rounded-lg border border-line bg-white px-3 py-2 text-muted" role="status">
              {photo.step === 'uploading' ? t('photo.uploading') : t('photo.checking')}
            </p>
          )}
        </div>

        {photo.step === 'locating' || photo.step === 'ready' ? (
          <div className="shrink-0 space-y-2 border-t border-line bg-white px-4 py-3">
            <h3 className="font-bold">{t('photo.title')}</h3>
            <p className="text-muted">{t('photo.intro')}</p>
            {photo.step === 'locating' ? (
              <p role="status" className="font-semibold">{t('photo.locating')}</p>
            ) : (
              <>
                <p className="flex items-center gap-2 font-semibold">
                  <Icon name="location" size={20} />
                  {t('photo.locationReady')}
                </p>
                <label className="block">
                  <span className="mb-1 block">{t('photo.note')}</span>
                  <input
                    type="text"
                    maxLength={280}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full rounded-lg border-2 border-line px-3 py-2"
                  />
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    void onFile(f, photo.coords)
                  }}
                />
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 font-bold text-white">
                  <Icon name="camera" size={20} />
                  {t('photo.choosePhoto')}
                </button>
              </>
            )}
            <button type="button" onClick={() => setPhoto({ step: 'closed' })} className="min-h-11 w-full font-semibold underline">
              {t('photo.cancel')}
            </button>
          </div>
        ) : (
          <div className="shrink-0 space-y-2 border-t border-line bg-white px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  disabled={busy || !apiReady}
                  onClick={() => void send(q.msg)}
                  className="min-h-11 rounded-full border-2 border-brand px-3 py-1.5 font-semibold text-brand disabled:opacity-50"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void shareLocation()}
                disabled={locating || !apiReady}
                aria-pressed={Boolean(coords)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line px-3 py-1.5 font-semibold disabled:opacity-60"
              >
                <Icon name="location" size={20} />
                {locating ? t('chat.locating') : shared ? t('chat.locationOn') : live.coords ? t('chat.locationLive') : t('chat.useLocation')}
              </button>
              <button
                type="button"
                onClick={() => void startPhoto()}
                disabled={busy || !apiReady}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border-2 border-line px-3 py-1.5 font-semibold disabled:opacity-60"
              >
                <Icon name="camera" size={20} />
                {t('photo.button')}
              </button>
            </div>
            <form onSubmit={onSubmit} className="flex items-end gap-2">
              <label htmlFor="chat-input" className="sr-only">
                {t('chat.inputLabel')}
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={input.length > 40 ? 3 : 1}
                maxLength={1000}
                value={input}
                placeholder={t('chat.placeholder')}
                disabled={!apiReady}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    onSubmit(e)
                  }
                }}
                className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-lg border-2 border-line px-3 py-2"
              />
              <button
                type="submit"
                disabled={pending || !input.trim() || !apiReady}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50"
              >
                <Icon name="send" size={20} />
                <span className="sr-only sm:not-sr-only">{t('chat.send')}</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
