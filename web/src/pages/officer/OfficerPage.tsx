import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { getAgencies, getBrief, getOfficerReports, patchReport, reassignReport } from '../../api/endpoints'
import { ApiError } from '../../api/client'
import type { BriefResponse, OfficerReport } from '../../api/types'
import { Attribution } from '../../components/Attribution'
import { PROVIDER_FALLBACK } from '../../lib/attribution'
import { Icon } from '../../components/Icon'
import { Linkify } from '../../components/Linkify'
import { USE_MOCK, config } from '../../config'
import { currentLang } from '../../i18n'
import { formatDateTime } from '../../lib/time'
import { DEV_SIGN_IN, officerAuth, type OfficerSession } from './auth'
import { MiniMap } from './MiniMap'

type Load<T> = { state: 'loading' } | { state: 'ok'; value: T } | { state: 'error' }
type NewStatus = 'confirmed' | 'resolved' | 'false'
/** 'forbidden' = the Cedar policy said no (e.g. resolving an unverified report). */
type Outcome = 'ok' | 'forbidden' | 'error'

const STATUS_FILTERS = ['', 'needs_review', 'verified', 'unverified', 'corroborated', 'pending', 'confirmed', 'resolved', 'false', 'rejected'] as const

async function act(fn: (tok: string) => Promise<{ report: OfficerReport } | OfficerReport>): Promise<{ outcome: Outcome; report?: OfficerReport }> {
  try {
    const res = await fn(await officerAuth.token())
    return { outcome: 'ok', report: 'report' in res ? res.report : res }
  } catch (e) {
    return { outcome: e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error' }
  }
}

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

  const input = 'w-full rounded-xl border-2 border-line bg-white px-3.5 py-2.5 transition-colors focus:border-brand'
  const demo = [
    ['pwd@demo.jaltaap.in', 'PWD · Delhi roads'],
    ['mcd@demo.jaltaap.in', 'MCD · Delhi civic'],
    ['djb@demo.jaltaap.in', 'DJB · Delhi water'],
    ['bmc@demo.jaltaap.in', 'BMC · Mumbai'],
    ['control@demo.jaltaap.in', t('officer.demoControl')],
  ] as const
  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto grid max-w-5xl gap-0 px-4 py-8 lg:grid-cols-2 lg:py-14">
        {/* brand panel */}
        <section className="relative hidden overflow-hidden rounded-l-3xl bg-night p-10 text-white lg:block">
          <div className="jt-grid-bg absolute inset-0" aria-hidden="true" />
          <div className="jt-blob absolute -top-24 -left-24 h-72 w-72 rounded-full bg-heat/30 blur-[90px]" aria-hidden="true" />
          <div className="jt-blob absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-water/30 blur-[90px]" style={{ animationDelay: '-6s' }} aria-hidden="true" />
          <div className="relative">
            <p className="inline-flex items-center gap-2 rounded-full jt-glass px-3 py-1 text-[15px] font-semibold"><Icon name="shield" size={16} />{t('officer.panelEyebrow')}</p>
            <h2 className="mt-5 text-3xl leading-tight font-extrabold tracking-tight">{t('officer.panelTitle')}</h2>
            <ul className="mt-8 space-y-5">
              {(['p1', 'p2', 'p3'] as const).map((k, i) => (
                <li key={k} className="flex gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl jt-glass">
                    <Icon name={(['camera', 'shield', 'sparkle'] as const)[i]} size={20} />
                  </span>
                  <span><b className="block">{t(`officer.panel.${k}Title`)}</b><span className="text-white/75">{t(`officer.panel.${k}`)}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        {/* form */}
        <form onSubmit={submit} className="space-y-5 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-line sm:p-9 lg:rounded-l-none">
          <div>
            <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white"><Icon name="shield" size={26} /></span>
            <h1 className="text-3xl font-extrabold tracking-tight">{t('officer.signInTitle')}</h1>
            <p className="mt-1 text-muted">{t('officer.signInIntro')}</p>
          </div>
          {USE_MOCK && <p className="rounded-xl bg-[#fff3bf] p-3 font-semibold">{t('officer.mockHint')}</p>}
          {DEV_SIGN_IN && !needNew && (
            <div className="rounded-2xl border border-dashed border-brand/40 bg-[#e7f1f8] p-3">
              <p className="mb-2 text-[15px] font-semibold text-brand">{t('officer.devHint')}</p>
              <div className="flex flex-wrap gap-2">
                {demo.map(([email, label]) => (
                  <button key={email} type="button" onClick={() => { setUsername(email); setPassword('JalTaap@2026') }}
                    className="rounded-full bg-white px-3 py-1.5 text-[15px] font-semibold ring-1 ring-line hover:ring-brand">
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!needNew ? (
            <>
              <label className="block">
                <span className="mb-1.5 block font-semibold">{t('officer.username')}</span>
                <input className={input} autoComplete="username" required value={username} onChange={(e) => setUsername(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1.5 block font-semibold">{t('officer.password')}</span>
                <input className={input} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <p>{t('officer.newPasswordHelp')}</p>
              <label className="block">
                <span className="mb-1.5 block font-semibold">{t('officer.newPassword')}</span>
                <input className={input} type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </label>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-xl border-2 border-[#c92a2a] bg-[#fff5f5] p-3 font-semibold">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-lg font-bold text-white transition-colors hover:bg-brand-dark disabled:opacity-60">
            {busy ? t('officer.signingIn') : needNew ? t('officer.setPassword') : t('officer.signIn')}
            {!busy && <Icon name="arrow-right" size={20} />}
          </button>
          <p className="flex items-center gap-2 text-[15px] text-muted"><Icon name="info" size={18} />{t('officer.secureNote')}</p>
        </form>
      </div>
    </div>
  )
}

// ---------------- report card ----------------

interface CardProps {
  report: OfficerReport
  readOnly: boolean
  agencies: string[]
  onSet: (id: string, s: NewStatus) => Promise<Outcome>
  onReassign: (id: string, agency: string) => Promise<Outcome>
}

function ReportCard({ report, readOnly, agencies, onSet, onReassign }: CardProps) {
  const { t, i18n } = useTranslation()
  const lang = currentLang()
  const [saving, setSaving] = useState<NewStatus | 'reassign' | null>(null)
  const [failed, setFailed] = useState<Outcome | null>(null)
  const [target, setTarget] = useState('')
  const summary = lang === 'hi' ? report.summary_hi || report.summary_en : report.summary_en || report.summary_hi
  const photo = report.photo_url || report.thumb_url
  const depthKey = `depth.${report.water_depth}`
  const statusKey = `status.${report.status}`

  async function set(s: NewStatus) {
    setSaving(s)
    setFailed(null)
    const out = await onSet(report.id, s)
    setSaving(null)
    if (out !== 'ok') setFailed(out)
  }

  async function reassign() {
    if (!target) return
    setSaving('reassign')
    setFailed(null)
    const out = await onReassign(report.id, target)
    setSaving(null)
    if (out !== 'ok') setFailed(out)
  }

  const isWater = report.category === 'water'
  const issueKey = `water.issue.${report.issue}`

  const rows: Array<[string, string]> = []
  if (report.source) rows.push([t('officer.source'), t(`officer.sourceKind.${report.source}`, { defaultValue: report.source })])
  if (typeof report.corroborations === 'number') rows.push([t('officer.corroborations'), String(report.corroborations)])
  if (report.reassigned_from) rows.push([t('officer.reassignedFrom'), report.reassigned_from])
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
        <span className="inline-flex items-center gap-1 rounded-full px-3 py-0.5 font-semibold ring-1 ring-line">
          <Icon name={isWater ? 'tap' : 'waves'} size={18} />
          {isWater ? (i18n.exists(issueKey) ? t(issueKey) : t('officer.categoryWater')) : t('officer.categoryFlood')}
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
      {readOnly ? (
        <p className="mt-3 border-t border-line pt-3 text-muted">{t('officer.readOnly', { agency: report.agency ?? '?' })}</p>
      ) : (
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
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor={`re-${report.id}`} className="font-semibold">{t('officer.reassign')}</label>
          <select id={`re-${report.id}`} value={target} onChange={(e) => setTarget(e.target.value)} className="min-h-11 rounded-lg border-2 border-line bg-white px-2 py-1.5">
            <option value="">{t('officer.chooseAgency')}</option>
            {agencies.filter((a) => a !== report.agency).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button type="button" disabled={!target || saving !== null} onClick={() => void reassign()} className="min-h-11 rounded-lg border-2 border-brand px-3 py-1.5 font-semibold text-brand disabled:opacity-50">
            {saving === 'reassign' ? t('officer.saving') : t('officer.handOver')}
          </button>
        </div>
        {failed && (
          <p role="alert" className="mt-2 font-semibold text-[#a61e4d]">
            {failed === 'forbidden' ? t('officer.forbidden') : t('officer.updateFailed')}
          </p>
        )}
      </div>
      )}
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
          {brief.value.generated_by === 'rules' && <p className="mt-1 rounded-lg bg-canvas px-2 py-1 text-[15px] text-muted">{t('officer.briefRules')}</p>}
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
  const agency = session.agency ?? ''
  const readOnly = session.controlRoom
  const [filter, setFilter] = useState<string>('')
  const [reports, setReports] = useState<Load<OfficerReport[]>>({ state: 'loading' })
  const [brief, setBrief] = useState<Load<BriefResponse>>({ state: 'loading' })
  const [agencies, setAgencies] = useState<string[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (readOnly) return
    let live = true
    officerAuth
      .token()
      .then((tok) => getAgencies(tok))
      .then((r) => live && setAgencies(r.agencies ?? []))
      .catch(() => live && setAgencies([]))
    return () => {
      live = false
    }
  }, [readOnly])

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
        if (readOnly) return
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
  }, [filter, agency, tick, readOnly])

  const onSet = useCallback(async (id: string, status: NewStatus): Promise<Outcome> => {
    const { outcome, report: updated } = await act((tok) => patchReport(tok, id, status))
    if (outcome === 'ok' && updated)
      setReports((prev) =>
        prev.state === 'ok' ? { state: 'ok', value: prev.value.map((r) => (r.id === id ? { ...r, ...updated, status: updated.status ?? status } : r)) } : prev,
      )
    return outcome
  }, [])

  // A handed-over report leaves this agency's queue.
  const onReassign = useCallback(async (id: string, to: string): Promise<Outcome> => {
    const { outcome } = await act((tok) => reassignReport(tok, id, to))
    if (outcome === 'ok') setReports((prev) => (prev.state === 'ok' ? { state: 'ok', value: prev.value.filter((r) => r.id !== id) } : prev))
    return outcome
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t('officer.title')}</h1>
        <span className="rounded-full bg-brand px-3 py-0.5 font-semibold text-white">
          {readOnly ? t('officer.controlRoom', { city: session.city }) : t('officer.agency', { agency })}
        </span>
        <span className="text-muted">{session.username}</span>
        <button type="button" onClick={onSignOut} className="ms-auto min-h-11 rounded-lg border-2 border-line bg-white px-3 py-1.5 font-semibold">
          {t('officer.signOut')}
        </button>
      </div>
      <div className={`grid gap-5 ${readOnly ? '' : 'lg:grid-cols-[1fr_360px]'}`}>
        {!readOnly && (
          <div className="lg:order-2">
            <div className="lg:sticky lg:top-4">
              <Brief brief={brief} />
            </div>
          </div>
        )}
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
                  <ReportCard key={r.id} report={r} readOnly={readOnly} agencies={agencies} onSet={onSet} onReassign={onReassign} />
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
  if (!session.agency && !session.controlRoom) {
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
