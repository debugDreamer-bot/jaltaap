import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import hi from './hi.json'
import { readStore, writeStore } from '../lib/storage'

export type Lang = 'en' | 'hi'

function initialLang(): Lang {
  const saved = readStore('jaltaap.lang')
  if (saved === 'en' || saved === 'hi') return saved
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const l of langs) {
    const base = (l || '').toLowerCase().split('-')[0]
    if (base === 'hi') return 'hi'
    if (base === 'en') return 'en'
  }
  return 'en'
}

const lang = initialLang()
document.documentElement.lang = lang

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React escapes text already
  returnNull: false,
})

export function setLang(l: Lang) {
  void i18n.changeLanguage(l)
  document.documentElement.lang = l
  writeStore('jaltaap.lang', l)
}

export function currentLang(): Lang {
  return i18n.language === 'hi' ? 'hi' : 'en'
}

export default i18n
