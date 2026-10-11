// System notifications for live warnings. Permission is asked only when the user turns them on.
export type NotifyState = 'unsupported' | 'default' | 'granted' | 'denied'

export function notifyState(): NotifyState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(undefined)
  return navigator.serviceWorker.register('/sw.js').catch(() => undefined)
}

export async function requestNotify(): Promise<NotifyState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  const result = await Notification.requestPermission()
  if (result === 'granted') await registration()
  return result
}

/** Best effort: through the service worker where possible (required on Android), else the page API. */
export async function showNotice(title: string, body: string): Promise<void> {
  if (notifyState() !== 'granted') return
  const options: NotificationOptions = { body, tag: 'jaltaap-live', icon: '/favicon.svg' }
  try {
    const reg = await registration()
    if (reg) {
      await reg.showNotification(title, options)
      return
    }
    new Notification(title, options)
  } catch {
    /* notifications are a convenience; the in-app banner already shows the warning */
  }
}
