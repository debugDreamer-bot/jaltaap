import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLang, setLang } from '../i18n'
import { useSettings } from '../lib/settings'
import { Link } from '../router'
import { Icon } from './Icon'

const LINKS = [
  { href: '/map', key: 'nav.map' },
  { href: '/me', key: 'nav.me' },
  { href: '/crew', key: 'nav.crew' },
  { href: '/about', key: 'nav.about' },
  { href: '/officer', key: 'nav.officer' },
] as const

export function Header({ path }: { path: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const lang = currentLang()
  const { live } = useSettings()

  const nav = (cls: string) =>
    LINKS.map((l) => (
      <Link
        key={l.href}
        href={l.href}
        aria-current={path === l.href ? 'page' : undefined}
        onClick={() => setOpen(false)}
        className={`${cls} rounded-full px-3.5 py-2 font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white aria-[current=page]:bg-white/15 aria-[current=page]:text-white`}
      >
        {t(l.key)}
        {l.href === '/me' && live && (
          <span className="ms-1.5 inline-block h-2 w-2 rounded-full bg-[#40c057] align-middle" aria-label={t('nav.liveOn')} role="img" />
        )}
      </Link>
    ))

  return (
    <header className="relative z-30 shrink-0 border-b border-white/10 bg-night text-white">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md py-1 pe-2 font-bold" onClick={() => setOpen(false)}>
          <img src="/favicon.svg" alt="" width={30} height={30} />
          <span className="text-xl" lang="en">JalTaap</span>
        </Link>
        <nav aria-label="Main" className="ms-4 hidden items-center gap-1 md:flex">
          {nav('')}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <Link
            href="/check"
            aria-current={path === '/check' ? 'page' : undefined}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff8a3d] to-[#f76707] px-3.5 py-1.5 font-bold text-[#1a1a1a] shadow-[0_6px_20px_-6px_rgb(247_103_7/0.8)] transition-transform hover:-translate-y-0.5"
          >
            <Icon name="location" size={18} />
            <span className="whitespace-nowrap sm:hidden">{t('nav.checkShort')}</span>
            <span className="hidden whitespace-nowrap sm:inline">{t('nav.check')}</span>
          </Link>
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            aria-label={t('nav.switchToLabel')}
            lang={lang === 'en' ? 'hi' : 'en'}
            className="rounded-full border border-white/30 px-3 py-1.5 font-semibold hover:bg-white/10"
          >
            {t('nav.switchTo')}
          </button>
          <button
            type="button"
            className="rounded-md p-2 hover:bg-white/15 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={t('nav.menu')}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name={open ? 'close' : 'menu'} size={24} />
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-14 flex flex-col gap-1 border-t border-white/10 bg-night px-3 py-2 shadow-lg md:hidden">
          {nav('block')}
        </nav>
      )}
    </header>
  )
}
