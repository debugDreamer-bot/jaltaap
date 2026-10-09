import { ICONS, type IconName } from '../lib/icons'

interface Props {
  name: IconName
  size?: number
  className?: string
  title?: string
}

/** Inline SVG icon. Markup comes from the static table in lib/icons.ts, never from the API. */
export function Icon({ name, size = 20, className, title }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  )
}
