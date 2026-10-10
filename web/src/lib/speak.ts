// Read a short answer aloud in a female Hindi voice: the main way a worker who does not read can use
// the web page. Order:
//   1. a female Hindi voice on the phone itself (free, works offline on most Android phones);
//   2. JalTaap's /speak endpoint: Amazon Polly's female neural voice Kajal, built on the server from
//      the same fixed sentences (for phones with no female Hindi voice);
//   3. any Hindi voice on the phone, pitched slightly higher.
// Only fixed copy and numbers are spoken, never API free text.
import { USE_MOCK, config } from '../config'

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

// Known female voices by platform: Google Android/Chrome (hi-in-x-hia, hi-in-x-hic, "Google हिन्दी"),
// Apple (Lekha, Kiyara), Microsoft (Swara, Kalpana), Amazon (Kajal, Aditi).
const FEMALE = /swara|kalpana|lekha|kiyara|kajal|aditi|hi-in-x-hia|hi-in-x-hic|google\s*(हिन्दी|hindi)|female|woman|heera|neerja|ananya/i
const MALE = /hemant|madhur|hi-in-x-hid|hi-in-x-hie|rishi|prabhat|\bmale\b|\bman\b/i

function voicesFor(lang: 'hi' | 'en'): SpeechSynthesisVoice[] {
  const want = lang === 'hi' ? ['hi-in', 'hi'] : ['en-in', 'en-gb', 'en-us', 'en']
  const all = window.speechSynthesis.getVoices()
  for (const w of want) {
    const vs = all.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(w))
    if (vs.length) return vs
  }
  return []
}

function femaleVoice(lang: 'hi' | 'en'): SpeechSynthesisVoice | undefined {
  const vs = voicesFor(lang)
  return vs.find((v) => FEMALE.test(`${v.name} ${v.voiceURI}`) && !MALE.test(v.name))
}

async function voicesReady(): Promise<void> {
  if (!canSpeak() || window.speechSynthesis.getVoices().length) return
  await new Promise<void>((resolve) => {
    window.speechSynthesis.addEventListener('voiceschanged', () => resolve(), { once: true })
    setTimeout(resolve, 1500)
  })
}

const serverVoice = (): boolean => !USE_MOCK && Boolean(config.apiUrl)

/** True when some voice can read the answer (on the phone or from the server). */
export async function hasVoice(lang: 'hi' | 'en'): Promise<boolean> {
  await voicesReady()
  return (canSpeak() && voicesFor(lang).length > 0) || serverVoice()
}

let audio: HTMLAudioElement | null = null

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel()
  if (audio) {
    audio.pause()
    audio = null
  }
}

function speakOnDevice(lines: string[], lang: 'hi' | 'en', voice: SpeechSynthesisVoice | undefined, onEnd?: () => void) {
  const synth = window.speechSynthesis
  synth.cancel()
  lines.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = voice?.lang ?? (lang === 'hi' ? 'hi-IN' : 'en-IN')
    if (voice) u.voice = voice
    u.rate = 0.9 // a little slower than default: easier to follow
    // No female voice on this phone: a slightly higher pitch sounds closer to one.
    u.pitch = voice && FEMALE.test(voice.name) ? 1 : 1.25
    if (i === lines.length - 1 && onEnd) u.onend = onEnd
    synth.speak(u)
  })
}

/**
 * Speak the answer in a female voice. `place` lets the server build the same sentences for Polly
 * when the phone has no female voice. Resolves once speaking has started.
 */
export async function speak(lines: string[], lang: 'hi' | 'en', place: { lat: number; lon: number } | null, onEnd?: () => void): Promise<void> {
  stopSpeaking()
  await voicesReady()
  const female = canSpeak() ? femaleVoice(lang) : undefined
  if (female) return speakOnDevice(lines, lang, female, onEnd)
  if (place && serverVoice()) {
    try {
      const url = `${config.apiUrl}/speak?lat=${place.lat.toFixed(3)}&lon=${place.lon.toFixed(3)}&lang=${lang}`
      const a = new Audio(url)
      audio = a
      a.onended = () => onEnd?.()
      await a.play()
      return
    } catch {
      audio = null // server voice unavailable: fall back to the phone
    }
  }
  if (canSpeak()) speakOnDevice(lines, lang, voicesFor(lang)[0], onEnd)
  else onEnd?.()
}
