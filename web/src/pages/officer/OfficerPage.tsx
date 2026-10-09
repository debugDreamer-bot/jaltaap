import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getBrief, getOfficerReports, patchReport } from '../../api/endpoints'
import type { BriefResponse, OfficerReport } from '../../api/types'
import { Attribution } from '../../components/Attribution'
import { PROVIDER_FALLBACK } from '../../lib/attribution'
import { Icon } from '../../components/Icon'
import { Linkify } from '../../components/Linkify'
import { USE_MOCK, config } from '../../config'
import { currentLang } from '../../i18n'
import { formatDateTime } from '../../lib/time'
import { officerAuth, type OfficerSession } from './auth'
import { MiniMap } from './MiniMap'

type Load<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error' }
type NewStatus = 'confirmed' | 'resolved' | 'false'

const STATUS_FILTERS = ['', 'needs_review', 'verified', 'pending', 'confirmed', 'resolved', 'false', 'rejected'] as const

// ---------------- sign-in ----------------

function SignIn({ onDone }: { onDone: (s: OfficerSession) => void }) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [needNew, setNeedNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = needNew ? await officerAuth.confirmNewPassword(newPassword) : await officerAuth.signIn(username.trim(), password)
      if (r.kind === 'done') onDone(r.session)
      else if (r.kind === 'new-password') setNeedNew(true)
      else setError(t('officer.unsupportedStep'))
    } catch {
      setError(t('officer.error'))
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-lg border-2 border-line px-3 py-2'
  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-white p-5 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">{t('officer.signInTitle')}</h1>
          <p className="text-muted">{t('officer.signInIntro')}</p>
        </div>
        {USE_MOCK && <p className="rounded-md bg-[#fff3bf] p-2 font-semibold">{t('officer.mockHint')}</p>}
        {!needNew ? (
          <>
            <label className="block">
              <span className="mb-1 block font-semibold">{t('officer.username')}</span>
              <input className={input} autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block font-semibold">{t('officer.password')}</span>
              <input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <p>{t('officer.newPasswordHelp')}</p>
            <label className="block">
              <span className="mb-1 block font-semibold">{t('officer.newPassword')}</span>
              <input className={input} type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </label>
          </>
        )}
        {error && (
          <p role="alert" className="rounded-md border-2 border-[#c92a2a] p-2 font-semibold">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-60">
          {busy ? t('officer.signingIn') : needNew ? t('officer.setPassword') : t('officer.signIn')}
        </button>
      </form>
    </div>
  )
}

// ---------------- report card ----------------

function ReportCard({ report, onSet }: { report: OfficerReport; onSet: (id: string, s: NewStatus) => Promise<boolean> }) {
  const { t, i18n } = useTranslation()
  const lang = currentLang()
  const [saving, setSaving] = useState<NewStatus | null>(null)
  const [failed, setFailed] = useState(false)
  const summary = lang === 'hi' ? report.summary_hi || report.summary_en : report.summary_en || report.summary_hi
  const photo = report.photo_url || report.thumb_url
  const depthKey = `depth.${report.water_depth}`
  const statusKey = `status.${report.status}`

  async function set(s: NewStatus) {
    setSaving(s)
    setFailed(false)
    const ok = await onSet(report.id, s)
    setSaving(null)
    if (!ok) setFailed(true)
  }

  const rows: Array<[string, string]> = []
  if (report.water_depth) rows.push([t('popup.depth'), i18n.exists(depthKey) ? t(depthKey) : report.water_depth])
  rows.push([t('popup.reported'), formatDateTime(report.created_at, lang) || t('popup.noValue')])
  if (report.hazard_type) rows.push([t('officer.hazard'), report.hazard_type])
  if (typeof report.severity === 'number') rows.push([t('officer.severity'), String(report.severity)])
  if (typeof report.confidence === 'number') rows.push([t('officer.confidence'), `${Math.round(report.confidence * 100)}%`])

  return (
    <li className="rounded-xl border border-line bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-canvas px-3 py-0.5 font-semibold ring-1 ring-line">
          {t('popup.status')}: {i18n.exists(statusKey) ? t(statusKey) : report.status}
        </span>
        <span className="font-mono text-muted">{report.id}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {photo && /^https?:\/\//i.test(photo) ? (
          <a href={photo} target="_blank" rel="noopener noreferrer" className="block">
            <img src={photo} alt={t('officer.photoAlt')} className="h-40 w-full rounded-md bg-canvas object-cover" loading="lazy" referrerPolicy="no-referrer" />
          </a>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-md bg-canvas text-muted">{t('officer.noPhoto')}</div>
        )}
        <MiniMap lat={report.lat} lon={report.lon} label={`${t('officer.location')}: ${report.lat.toFixed(4)}, ${report.lon.toFixed(4)}`} />
      </div>
      {summary && (
        <p className="mt-3 font-semibold">
          <Linkify text={summary} />
        </p>
      )}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-semibold break-words">{v}</dd>
          </div>
        ))}
        {report.note && (
          <div className="contents">
            <dt className="text-muted">{t('officer.note')}</dt>
            <dd className="break-words">{report.note}</dd>
          </div>
        )}
        <div className="contents">
          <dt className="text-muted">{t('officer.location')}</dt>
          <dd>
            <a
              className="link"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lon}#map=17/${report.lat}/${report.lon}`}
            >
              {t('officer.openMap')}
            </a>
          </dd>
        </div>
      </dl>
      <div className="mt-3 border-t border-line pt-3">
        <p className="mb-2 font-semibold">{t('officer.setStatus')}</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['confirmed', 'officer.confirm', 'bg-[#1864ab] text-white'],
              ['resolved', 'officer.resolve', 'bg-[#237032] text-white'],
              ['false', 'officer.false', 'bg-white text-[#a61e4d] ring-2 ring-[#a61e4d]'],
            ] as const
          ).map(([s, key, cls]) => (
            <button
              key={s}
              type="button"
              disabled={saving !== null || report.status === s}
              onClick={() => void set(s)}
              aria-pressed={report.status === s}
              className={`min-h-11 rounded-lg px-2 py-2 font-bold disabled:opacity-50 ${cls}`}
            >
              {saving === s ? t('officer.saving') : t(key)}
            </button>
          ))}
        </div>
        {failed && (
          <p role="alert" className="mt-2 font-semibold text-[#a61e4d]">
            {t('officer.updateFailed')}
          </p>
        )}
      </div>
    </li>
  )
}

// ---------------- brief ----------------

function Brief({ brief }: { brief: Load<BriefResponse> }) {
  const { t } = useTranslation()
  const lang = currentLang()
  return (
    <section aria-labelledby="brief-title" className="rounded-xl border border-line bg-white p-4 shadow-sm">
      <h2 id="brief-title" className="text-xl font-bold">
        {t('officer.brief')}
      </h2>
      {brief.state === 'loading' && <p role="status" className="text-muted">{t('officer.briefLoading')}</p>}
      {brief.state === 'error' && <p role="alert" className="font-semibold">{t('officer.briefUnavailable')}</p>}
      {brief.state === 'ok' && (
        <>
          {brief.value.generated_at && <p className="text-muted">{t('officer.generatedAt', { time: formatDateTime(brief.value.generated_at, lang) })}</p>}
          {brief.value.actions.length === 0 ? (
            <p className="mt-2">{t('officer.briefEmpty')}</p>
          ) : (
            <ol className="mt-3 space-y-3">
              {brief.value.actions.map((a) => (
                <li key={`${a.n}-${a.spot}`} className="rounded-lg bg-canvas p-3">
                  <p className="font-bold">
                    {a.n}. {a.spot}
                  </p>
                  <p>
                    <span className="text-muted">{t('officer.evidence')}: </span>
                    {a.evidence}
                  </p>
                  <p>
                    <span className="text-muted">{t('officer.ask')}: </span>
                    <span className="font-semibold">{a.ask}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  )
}

// ---------------- dashboard ----------------

function Dashboard({ session, onSignOut }: { session: OfficerSession; onSignOut: () => void }) {
  const { t } = useTranslation()
  const agency = session.agency as string
  const [filter, setFilter] = useState<string>('')
  const [reports, setReports] = useState<Load<OfficerReport[]>>({ state: 'loading' })
  const [brief, setBrief] = useState<Load<BriefResponse>>({ state: 'loading' })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let live = true
    setReports({ state: 'loading' })
    setBrief({ state: 'loading' })
    officerAuth
      .token()
      .then((tok) => {
        getOfficerReports(tok, filter || undefined)
          .then((r) => live && setReports({ state: 'ok', value: r.reports ?? [] }))
          .catch(() => live && setReports({ state: 'error' }))
        getBrief(tok, agency)
          .then((b) => live && setBrief({ state: 'ok', value: { ...b, actions: b.actions ?? [] } }))
          .catch(() => live && setBrief({ state: 'error' }))
      })
      .catch(() => {
        if (!live) return
        setReports({ state: 'error' })
        setBrief({ state: 'error' })
      })
    return () => {
      live = false
    }
  }, [filter, agency, tick])

  const onSet = useCallback(async (id: string, status: NewStatus) => {
    try {
      const tok = await officerAuth.token()
      const res = (await patchReport(tok, id, status)) as OfficerReport | { report: OfficerReport }
      const updated = 'report' in res ? res.report : res
      setReports((prev) =>
        prev.state === 'ok' ? { state: 'ok', value: prev.value.map((r) => (r.id === id ? { ...r, ...updated, status: updated.status ?? status } : r)) } : prev,
      )
      return true
    } catch {
      return false
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t('officer.title')}</h1>
        <span className="rounded-full bg-brand px-3 py-0.5 font-semibold text-white">{t('officer.agency', { agency })}</span>
        <span className="text-muted">{session.username}</span>
        <button type="button" onClick={onSignOut} className="ms-auto min-h-11 rounded-lg border-2 border-line bg-white px-3 py-1.5 font-semibold">
          {t('officer.signOut')}
        </button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="lg:order-2">
          <div className="lg:sticky lg:top-4">
            <Brief brief={brief} />
          </div>
        </div>
        <section aria-labelledby="queue-title" className="lg:order-1">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <h2 id="queue-title" className="text-xl font-bold">
              {t('officer.queue')}
            </h2>
            <label className="ms-auto flex items-center gap-2">
              <span>{t('officer.filter')}</span>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border-2 border-line bg-white px-2 py-1.5">
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {s ? t(`status.${s}`) : t('officer.all')}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setTick((n) => n + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border-2 border-line bg-white px-3 py-1.5 font-semibold">
              <Icon name="refresh" size={18} />
              {t('officer.refresh')}
            </button>
          </div>
          {reports.state === 'loading' && <p role="status" className="text-muted">{t('officer.loading')}</p>}
          {reports.state === 'error' && <p role="alert" className="font-semibold">{t('officer.unavailable')}</p>}
          {reports.state === 'ok' &&
            (reports.value.length === 0 ? (
              <p>{t('officer.empty')}</p>
            ) : (
              <ul className="space-y-4">
                {reports.value.map((r) => (
                  <ReportCard key={r.id} report={r} onSet={onSet} />
                ))}
              </ul>
            ))}
        </section>
      </div>
      <footer className="mt-6">
        <Attribution items={PROVIDER_FALLBACK[config.mapKey ? 'amazon' : 'openfreemap']} />
      </footer>
    </div>
  )
}

export default function OfficerPage() {
  const { t } = useTranslation()
  const [session, setSession] = useState<OfficerSession | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    officerAuth
      .current()
      .then((s) => live && setSession(s))
      .catch(() => live && setSession(null))
    return () => {
      live = false
    }
  }, [])

  if (!officerAuth.configured) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold">{t('officer.signInTitle')}</h1>
        <p role="alert" className="rounded-lg border-2 border-[#c92a2a] bg-white p-3 font-semibold">
          {t('officer.notConfigured')}
        </p>
      </div>
    )
  }
  if (session === undefined) return <p role="status" className="p-6 text-center text-muted">{t('common.loading')}</p>
  if (!session) return <SignIn onDone={setSession} />
  if (!session.agency) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-8">
        <p role="alert" className="rounded-lg border-2 border-[#c92a2a] bg-white p-3 font-semibold">
          {t('officer.noAgency')}
        </p>
        <button type="button" onClick={() => void officerAuth.signOut().then(() => setSession(null))} className="min-h-11 rounded-lg border-2 border-line bg-white px-3 py-1.5 font-semibold">
          {t('officer.signOut')}
        </button>
      </div>
    )
  }
  return <Dashboard session={session} onSignOut={() => void officerAuth.signOut().then(() => setSession(null))} />
}
