import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLang, setLang } from '../i18n'
import { Link } from '../router'
import { Icon } from './Icon'

const LINKS = [
  { href: '/', key: 'nav.map' },
  { href: '/about', key: 'nav.about' },
  { href: '/officer', key: 'nav.officer' },
] as const

export function Header({ path }: { path: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const lang = currentLang()

  const nav = (cls: string) =>
    LINKS.map((l) => (
      <Link
        key={l.href}
        href={l.href}
        aria-current={path === l.href ? 'page' : undefined}
        onClick={() => setOpen(false)}
        className={`${cls} rounded-md px-3 py-2 font-semibold hover:bg-white/15 aria-[current=page]:bg-white/20 aria-[current=page]:underline`}
      >
        {t(l.key)}
      </Link>
    ))

  return (
    <header className="relative z-30 shrink-0 bg-brand text-white shadow">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 rounded-md py-1 pe-2 font-bold" onClick={() => setOpen(false)}>
          <img src="/favicon.svg" alt="" width={30} height={30} />
          <span className="truncate text-xl" lang="en">JalTaap</span>
        </Link>
        <nav aria-label="Main" className="ms-4 hidden items-center gap-1 md:flex">
          {nav('')}
        </nav>
        <div className="ms-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            aria-label={t('nav.switchToLabel')}
            lang={lang === 'en' ? 'hi' : 'en'}
            className="rounded-md border border-white/60 px-3 py-1.5 font-semibold hover:bg-white/15"
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
        <nav id="mobile-nav" aria-label="Main" className="absolute inset-x-0 top-14 flex flex-col gap-1 border-t border-white/20 bg-brand px-3 py-2 shadow-lg md:hidden">
          {nav('block')}
        </nav>
      )}
    </header>
  )
}
