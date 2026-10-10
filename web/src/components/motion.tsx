// Shared scroll-reveal and count-up pieces for the landing and about pages. Wrap the page in
// <MotionPage> (LazyMotion + reduced-motion respect) before using them.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LazyMotion, MotionConfig, animate, domAnimation, m, useInView } from 'motion/react'
import { ease } from '../lib/ease'

export function MotionPage({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}

export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <m.div className={className} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay, ease }}>
      {children}
    </m.div>
  )
}

export function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!inView) return
    const c = animate(0, to, { duration: 1.6, ease: 'easeOut', onUpdate: (x) => setV(x) })
    return () => c.stop()
  }, [inView, to])
  return <span ref={ref}>{v.toFixed(Number.isInteger(to) ? 0 : 1)}{suffix}</span>
}
