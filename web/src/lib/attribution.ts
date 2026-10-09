export interface AttribItem {
  text: string
  href?: string
}

export const PROVIDER_FALLBACK: Record<'amazon' | 'openfreemap', AttribItem[]> = {
  amazon: [{ text: '© Amazon Location Service', href: 'https://aws.amazon.com/location/' }],
  openfreemap: [
    { text: 'OpenFreeMap', href: 'https://openfreemap.org' },
    { text: '© OpenMapTiles', href: 'https://www.openmaptiles.org/' },
  ],
}

/**
 * Parse a map style's attribution HTML into plain text + http(s) links. DOMParser never
 * executes scripts; we only read text and href values and render them through React.
 */
export function parseAttribution(html: string): AttribItem[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const out: AttribItem[] = []
  const walk = (node: Node) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const s = (n.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (s && !/^[|·,;-]+$/.test(s)) out.push({ text: s })
      } else if (n instanceof HTMLAnchorElement) {
        const s = (n.textContent ?? '').replace(/\s+/g, ' ').trim()
        const href = n.getAttribute('href') ?? ''
        if (s) out.push({ text: s, href: /^https?:\/\//i.test(href) ? href : undefined })
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        walk(n)
      }
    })
  }
  walk(doc.body)
  return out
}

