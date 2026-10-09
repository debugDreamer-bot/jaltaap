import { Fragment } from 'react'

// Server text is rendered as React text nodes (escaped by React). Only http(s) URLs become
// links; nothing is ever passed to innerHTML.
const URL_RE = /\bhttps?:\/\/[^\s<>"'()]+[^\s<>"'().,;:!?]/gi

export function Linkify({ text }: { text: string }) {
  const parts: Array<{ text: string; href?: string }> = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0
    if (i > last) parts.push({ text: text.slice(last, i) })
    parts.push({ text: m[0], href: m[0] })
    last = i + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return (
    <>
      {parts.map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline">
            {p.text}
          </a>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  )
}
