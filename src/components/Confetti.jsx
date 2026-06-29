import { useEffect, useRef } from 'react'

// Lightweight canvas confetti burst. Respects prefers-reduced-motion (no-op).
export default function Confetti({ fire }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!fire) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
    }
    resize()

    const colors = ['#ff3d81', '#21e6c1', '#ffc53d', '#7c5cff', '#3db8ff']
    const N = 140
    const parts = Array.from({ length: N }).map(() => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * canvas.width * 0.3,
      y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 14 * dpr,
      vy: (Math.random() - 1.1) * 14 * dpr,
      g: 0.32 * dpr,
      size: (4 + Math.random() * 6) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[(Math.random() * colors.length) | 0],
      life: 1,
    }))

    let raf
    let t = 0
    const tick = () => {
      t += 1
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      parts.forEach((p) => {
        p.vy += p.g
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vr
        p.life -= 0.008
        ctx.save()
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      })
      if (t < 160) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    tick()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [fire])

  return <canvas className="confetti-canvas" ref={canvasRef} aria-hidden="true" />
}
