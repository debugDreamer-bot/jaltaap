// "Someone is unwell": a picture-based check for people who may not read. Tap what you see; any
// danger sign puts Call 112 first, with spoken first-aid steps and the nearest hospital. Fixed copy
// only (the same steps as the chat's emergency guard): no diagnosis, no medicines, no AI.
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRelief } from '../api/endpoints'
import type { ReliefPoint } from '../api/types'
import { Icon } from '../components/Icon'
import { currentLang } from '../i18n'
import { geoErrorCode, getLocation } from '../lib/geo'
import type { IconName } from '../lib/icons'
import { hasVoice, speak, stopSpeaking } from '../lib/speak'
import { readStore } from '../lib/storage'
import { Link } from '../router'

// Danger signs of heatstroke (the chat's emergency list) and milder signs of heat exhaustion.
const SIGNS: Array<{ id: string; icon: IconName; danger: boolean }> = [
  { id: 'confused', icon: 'confused', danger: true },
  { id: 'fainted', icon: 'faint', danger: true },
  { id: 'hotDry', icon: 'thermometer', danger: true },
  { id: 'fits', icon: 'seizure', danger: true },
  { id: 'vomiting', icon: 'vomit', danger: true },
  { id: 'dizzy', icon: 'dizzy', danger: false },
  { id: 'cramps', icon: 'bolt', danger: false },
  { id: 'sweatWeak', icon: 'sweat', danger: false },
]
const DANGER_STEPS: Array<[IconName, string]> = [['tree', 's1'], ['shirt', 's2'], ['water', 's3'], ['fan', 's4'], ['glass', 's5'], ['crew', 's6']]
const MILD_STEPS: Array<[IconName, string]> = [['tree', 'm1'], ['glass', 'm2'], ['shirt', 'm3'], ['water', 'm4'], ['clock', 'm5']]

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function savedPlace(): { lat: number; lon: number } | null {
  try {
    const p = JSON.parse(readStore('jaltaap.check.place') ?? 'null')
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? p : null
  } catch {
    return null
  }
}

export default function UnwellPage() {
  const { t } = useTranslation()
  const lang = currentLang()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [show, setShow] = useState(false)
  const [voiceOk, setVoiceOk] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [place, setPlace] = useState(savedPlace)
  const [hospitals, setHospitals] = useState<ReliefPoint[]>([])
  const [geoMsg, setGeoMsg] = useState('')

  useEffect(() => {
    void hasVoice(lang).then(setVoiceOk)
  }, [lang])
  useEffect(() => {
    getRelief().then((r) => setHospitals((r.points ?? []).filter((p) => p.kind === 'hospital' && p.status !== 'planned'))).catch(() => setHospitals([]))
  }, [])
  useEffect(() => () => stopSpeaking(), [])

  const danger = SIGNS.some((s) => s.danger && picked.has(s.id))
  const steps = danger ? DANGER_STEPS : MILD_STEPS
  const nearest = useMemo(() => {
    if (!place) return null
    return hospitals.map((p) => ({ p, d: km(place, p) })).filter((x) => x.d <= 30).sort((a, b) => a.d - b.d)[0] ?? null
  }, [hospitals, place])

  const toggle = (id: string) => {
    setShow(false)
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const lines = [danger ? t('unwell.call112') : t('unwell.mildTitle'), ...steps.map(([, k]) => t(`unwell.${k}`)), danger ? '' : t('unwell.m6')].filter(Boolean)
  const say = () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    void speak(lines, lang, null, () => setSpeaking(false)) // phone voice only: /speak reads heat plans, not first aid
  }
  const findMe = async () => {
    setGeoMsg(t('chat.locating'))
    try {
      setPlace(await getLocation())
      setGeoMsg('')
    } catch (e) {
      const code = geoErrorCode(e)
      setGeoMsg(t(code === 'denied' ? 'chat.locationDenied' : code === 'unsupported' ? 'chat.locationUnsupported' : 'chat.locationUnavailable'))
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-5">
      <a href="tel:112" className="flex min-h-16 items-center justify-center gap-3 rounded-3xl bg-[#c92a2a] px-4 text-2xl font-extrabold text-white shadow-lg active:scale-[0.98]">
        <Icon name="phone" size={32} />{t('check.call112')}
      </a>

      {!show && (
        <section className="jt-rise space-y-4">
          <h1 className="text-3xl font-extrabold tracking-tight">{t('unwell.title')}</h1>
          <p className="text-lg text-muted">{t('unwell.tap')}</p>
          <ul className="grid grid-cols-2 gap-3">
            {SIGNS.map((s) => {
              const on = picked.has(s.id)
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => toggle(s.id)} aria-pressed={on}
                    className={`flex min-h-36 w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 p-3 text-center transition-colors active:scale-[0.98] ${on ? (s.danger ? 'border-[#c92a2a] bg-[#fff5f5]' : 'border-[#f76707] bg-[#fff4e6]') : 'border-line bg-white'}`}>
                    <span className={`relative inline-flex h-16 w-16 items-center justify-center rounded-2xl ${on ? (s.danger ? 'bg-[#c92a2a] text-white' : 'bg-[#f76707] text-[#1a1a1a]') : 'bg-canvas text-ink'}`}>
                      <Icon name={s.icon} size={40} />
                      {on && <span className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white"><Icon name="check" size={16} /></span>}
                    </span>
                    <span className="text-lg leading-tight font-bold">{t(`unwell.sign.${s.id}`)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button type="button" disabled={picked.size === 0} onClick={() => setShow(true)}
            className="flex min-h-16 w-full items-center justify-center gap-2 rounded-3xl bg-brand text-xl font-bold text-white disabled:opacity-50">
            {t('unwell.show')}<Icon name="arrow-right" size={24} />
          </button>
        </section>
      )}

      {show && (
        <section aria-live="assertive" className="jt-rise space-y-4">
          <div className={`rounded-[2rem] p-6 shadow-xl ${danger ? 'bg-[#c92a2a] text-white' : 'bg-[#f76707] text-[#1a1a1a]'}`}>
            <span className={`relative mb-3 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-white/20 ${danger ? 'jt-ring' : ''}`}>
              <Icon name={danger ? 'phone' : 'tree'} size={48} />
            </span>
            <h1 className="text-3xl leading-tight font-extrabold">{danger ? t('unwell.call112') : t('unwell.mildTitle')}</h1>
            <p className="mt-2 text-lg font-semibold">{danger ? t('unwell.dangerSub') : t('unwell.mildSub')}</p>
            {danger && (
              <a href="tel:112" className="mt-4 inline-flex min-h-14 items-center gap-2 rounded-2xl bg-white px-5 text-xl font-extrabold text-[#c92a2a]">
                <Icon name="phone" size={26} />{t('check.call112')}
              </a>
            )}
          </div>

          {voiceOk && (
            <button type="button" onClick={say} aria-pressed={speaking}
              className="flex min-h-16 w-full items-center justify-center gap-3 rounded-3xl border-2 border-ink bg-white text-xl font-bold">
              <Icon name="speaker" size={30} />{speaking ? t('check.stop') : t('check.listen')}
            </button>
          )}

          <ol className="space-y-3">
            {steps.map(([icon, k], i) => (
              <li key={k} className="flex items-center gap-4 rounded-3xl border border-line bg-white p-4 shadow-sm">
                <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-canvas"><Icon name={icon} size={34} /></span>
                <span className="text-xl leading-snug font-bold"><span className="me-1 text-muted">{i + 1}.</span>{t(`unwell.${k}`)}</span>
              </li>
            ))}
          </ol>

          {!danger && (
            <a href="tel:112" className="flex min-h-16 items-center justify-center gap-3 rounded-3xl border-2 border-[#c92a2a] bg-white px-4 text-center text-lg font-bold text-[#c92a2a]">
              <Icon name="phone" size={26} />{t('unwell.m6')}
            </a>
          )}

          <div className="rounded-3xl border border-line bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xl font-bold"><Icon name="hospital" size={28} />{t('unwell.hospital')}</p>
            {nearest ? (
              <>
                <p className="mt-1 text-lg font-semibold">{lang === 'hi' && nearest.p.name_hi ? nearest.p.name_hi : nearest.p.name}</p>
                <p className="text-muted">{t('check.km', { km: nearest.d.toFixed(1) })}</p>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${nearest.p.lat},${nearest.p.lon}`} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-brand px-4 text-lg font-bold text-white"><Icon name="map" size={22} />{t('check.directions')}</a>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void findMe()} className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-brand px-4 text-lg font-bold text-brand">
                  <Icon name="location" size={22} />{t('unwell.findHospital')}
                </button>
                {geoMsg && <p className="mt-1 text-muted">{geoMsg}</p>}
                {place && !nearest && <p className="mt-1 text-muted">{t('unwell.noHospital')}</p>}
              </>
            )}
          </div>

          <button type="button" onClick={() => setShow(false)} className="min-h-12 w-full font-semibold underline">{t('unwell.back')}</button>
          <p className="text-center text-[15px] text-muted">{t('unwell.notDiagnosis')}</p>
        </section>
      )}

      <p className="text-center"><Link href="/check" className="link">{t('unwell.toCheck')}</Link></p>
    </div>
  )
}
