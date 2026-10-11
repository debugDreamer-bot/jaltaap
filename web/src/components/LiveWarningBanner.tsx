// The worst live warning for where the user is right now, under the header on every page.
// Shown only while live safety is on; dismissing hides it until the warning changes.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { openChat } from '../lib/chat'
import { useLiveSafety } from '../lib/liveSafety'
import { SEVERITY_STYLE, describeWarning } from '../lib/warnings'
import { Link } from '../router'
import { Icon } from './Icon'

export function LiveWarningBanner() {
  const { t } = useTranslation()
  const { status, warnings } = useLiveSafety()
  const [dismissed, setDismissed] = useState('')
  const top = warnings[0]
  const key = top ? `${top.hazard}:${top.level}:${top.severity}` : ''
  if (status !== 'on' || !top || top.severity < 2 || dismissed === key) return null

  const text = describeWarning(top, t)
  const style = SEVERITY_STYLE[top.severity]
  const more = warnings.filter((w) => w.severity >= 2).length - 1
  return (
    <div role="alert" className="relative z-20 shrink-0 border-b-2 px-3 py-2 sm:px-4" style={{ background: style.bg, color: style.ink, borderColor: style.ring }}>
      {/* phones: text full width, actions underneath; wider screens: one row */}
      <div className="mx-auto flex max-w-6xl items-start gap-3 sm:items-center">
        <Icon name={text.icon} size={24} className="mt-0.5 shrink-0 sm:mt-0" />
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <p className="min-w-0 sm:flex-1">
            <b>{text.title}: </b>
            {text.headline} <span className="font-semibold">{text.action}</span>
            {more > 0 && <span className="ms-1 opacity-80">{t('live.more', { count: more })}</span>}
          </p>
          <div className="-ms-2 flex shrink-0 items-center gap-1 sm:ms-0">
            <button type="button" onClick={() => openChat(t('live.askPrompt', { warning: text.headline }))} className="min-h-11 rounded-lg px-2 font-bold underline">
              {t('live.ask')}
            </button>
            <Link href="/me" className="min-h-11 content-center rounded-lg px-2 font-semibold underline">
              {t('live.details')}
            </Link>
            <button type="button" onClick={() => setDismissed(key)} aria-label={t('live.dismiss')} className="rounded-md p-2 hover:bg-black/10">
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
