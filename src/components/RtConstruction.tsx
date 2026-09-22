import { useEffect } from 'react'
import type { SegmentAnalysis } from '../types'
import { fmt } from '../math/epure'

const C = {
  base1: '#d97706',
  rise1: '#0284c7',
  rise2: '#16a34a',
  hyp: '#2563eb',
  ink: '#1c2733',
  dim: '#64748b',
  paper: '#f8fafc',
  grid: '#e2e8f0',
}

interface TriangleSpec {
  title: string
  subtitle: string
  baseLeg: number
  riseLeg: number
  baseLabel: string
  riseLabel: string
  baseColor: string
  riseColor: string
  angleLabel: string
}

/** Велике креслення одного прямокутного трикутника. */
function TriangleBig({ spec }: { spec: TriangleSpec }) {
  const W = 380
  const H = 260
  const padX = 58
  const padY = 44

  const { baseLeg, riseLeg } = spec
  if (baseLeg < 1e-9 && riseLeg < 1e-9) {
    return <div className="flex h-full items-center justify-center text-xs text-slate-400">вироджений відрізок</div>
  }

  const s = Math.min((W - 2 * padX) / Math.max(baseLeg, 1e-9), (H - 2 * padY) / Math.max(riseLeg, 1e-9))
  const b = baseLeg * s
  const r = riseLeg * s
  const x0 = padX
  const y0 = H - padY
  const xb = x0 + b
  const yr = y0 - r

  const angle = Math.atan2(r, b)
  const angleDeg = (angle * 180) / Math.PI
  const hypMidX = x0 + b * 0.5
  const hypMidY = y0 - r * 0.5

  const arcR = Math.min(54, b * 0.5, r * 0.65)
  const arcLabelX = x0 + (arcR + 16) * Math.cos(angle / 2)
  const arcLabelY = y0 - (arcR + 16) * Math.sin(angle / 2) + 4

  const hypAngleDeg = -angleDeg

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-full" role="img" aria-label={spec.title}>
      <rect x={6} y={6} width={W - 12} height={H - 12} fill={C.paper} stroke={C.grid} rx={6} />

      {/* горизонтальна опора (проєкція) */}
      <line x1={x0} y1={y0} x2={xb} y2={y0} stroke={spec.baseColor} strokeWidth={2.4} />
      <path d={`M ${xb} ${y0} l 8 -3.2 v 6.4 z`} fill={spec.baseColor} />
      <line x1={x0} y1={y0} x2={x0} y2={y0 - 8} stroke={spec.baseColor} strokeWidth={2} />
      <text x={x0 + b / 2} y={y0 + 18} fontSize={13} textAnchor="middle" fill={spec.baseColor} fontFamily="monospace" fontWeight={700}>
        {spec.baseLabel}
      </text>

      {/* вертикальна різниця координат */}
      <line x1={xb} y1={y0} x2={xb} y2={yr} stroke={spec.riseColor} strokeWidth={2.4} />
      <path d={`M ${xb} ${yr} l -3.2 8 h 6.4 z`} fill={spec.riseColor} />
      <text x={xb + 12} y={y0 - r / 2 + 4} fontSize={13} textAnchor="middle" fill={spec.riseColor} fontFamily="monospace" fontWeight={700}>
        {spec.riseLabel}
      </text>

      {/* гіпотенуза = натуральна довжина */}
      <line x1={x0} y1={y0} x2={xb} y2={yr} stroke={C.hyp} strokeWidth={3} />
      <text
        x={hypMidX}
        y={hypMidY - 8}
        fontSize={14}
        textAnchor="middle"
        fill={C.hyp}
        fontFamily="monospace"
        fontWeight={700}
        transform={`rotate(${hypAngleDeg} ${hypMidX} ${hypMidY})`}
      >
        |AB|
      </text>

      {/* знак прямого кута */}
      <path d={`M ${xb - 10} ${y0} v -10 h 10`} fill="none" stroke={C.dim} strokeWidth={1.2} />

      {/* дуга кута до площини */}
      <path d={arcPath(x0, y0, arcR, angle)} fill="none" stroke={C.dim} strokeWidth={1.2} />
      <text x={arcLabelX} y={arcLabelY} fontSize={12} textAnchor="middle" fill={C.ink} fontFamily="monospace" fontWeight={700}>
        {spec.angleLabel}
      </text>

      {/* вершина */}
      <circle cx={x0} cy={y0} r={4} fill="#fff" stroke={C.ink} strokeWidth={1.4} />
      <text x={x0 - 14} y={y0 + 18} fontSize={12} fill={C.dim} fontFamily="monospace" textAnchor="end">
        A₁·B₁
      </text>

      <text x={W / 2} y={H - 12} fontSize={11} fill={C.dim} fontFamily="monospace" textAnchor="middle">
        {spec.subtitle}
      </text>
    </svg>
  )
}

function arcPath(cx: number, cy: number, r: number, angle: number): string {
  const ex = cx + r * Math.cos(angle)
  const ey = cy - r * Math.sin(angle)
  return `M ${cx + r} ${cy} A ${r} ${r} 0 0 1 ${ex} ${ey}`
}

/** Міні-діаграма "методу прямокутного трикутника" (перший трикутник). */
export function RtTriangle({ seg }: { seg: SegmentAnalysis }) {
  const base = Math.abs(seg.lengthP1)
  const rise = Math.abs(seg.dz)
  if (base < 1e-9 && rise < 1e-9) return <div className="text-[11px] text-slate-400">—</div>

  const W = 118
  const H = 84
  const m = 10
  const s = Math.min((W - 2 * m - 16) / Math.max(base, 1e-9), (H - 2 * m - 10) / Math.max(rise, 1e-9))
  const b = base * s
  const r = rise * s
  const ax = m
  const ay = H - m
  const hypAngle = (Math.atan2(r, b) * 180) / Math.PI
  const hypLblX = ax + b * 0.5
  const hypLblY = ay - r * 0.5 - 6

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-auto" aria-label={`Метод прямокутного трикутника для ${seg.label}`}>
      <line x1={ax} y1={ay} x2={ax + b} y2={ay} stroke={C.base1} strokeWidth={1.2} />
      <line x1={ax + b} y1={ay} x2={ax + b} y2={ay - r} stroke={C.rise1} strokeWidth={1.2} />
      <line x1={ax} y1={ay} x2={ax + b} y2={ay - r} stroke={C.hyp} strokeWidth={1.6} />
      <path d={`M ${ax + b - 6} ${ay - 6} H ${ax + b} V ${ay}`} fill="none" stroke={C.dim} strokeWidth={0.8} />
      <path d={`M ${ax + b} ${ay} l 7 -3 v 6 z`} fill={C.base1} />
      <path d={`M ${ax + b} ${ay - r} l 3 7 h 6 z`} fill={C.rise1} />
      <text x={ax + b / 2} y={ay + 12} fontSize={9} textAnchor="middle" fill={C.base1} fontFamily="monospace">
        Π1·[A₁B₁]
      </text>
      <text x={ax + b + 10} y={ay - r / 2 + 3} fontSize={9} textAnchor="middle" fill={C.rise1} fontFamily="monospace">
        Δz
      </text>
      <text x={hypLblX} y={hypLblY} fontSize={9} fill={C.hyp} fontFamily="monospace" fontWeight={700} transform={`rotate(${-hypAngle} ${hypLblX} ${hypLblY})`}>
        |AB|
      </text>
    </svg>
  )
}

/** Модальне вікно з великим кресленням побудови натуральної довжини. */
export function RtModal({ seg, onClose }: { seg: SegmentAnalysis; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const tr1: TriangleSpec = {
    title: 'Трикутник за Π₁ (катети A₁B₁ та Δz)',
    subtitle: 'катет Π₁ = A₁B₁, катет Δz = |Z_B − Z_A|, гіпотенуза = |AB|',
    baseLeg: seg.lengthP1,
    riseLeg: Math.abs(seg.dz),
    baseLabel: `A₁B₁ = ${fmt(seg.lengthP1, 3)}`,
    riseLabel: `Δz = ${fmt(Math.abs(seg.dz), 3)}`,
    baseColor: C.base1,
    riseColor: C.rise1,
    angleLabel: `α = ${fmt(seg.angleToP1, 1)}°`,
  }

  const tr2: TriangleSpec = {
    title: 'Трикутник за Π₂ (катети A₂B₂ та Δy)',
    subtitle: 'катет Π₂ = A₂B₂, катет Δy = |Y_B − Y_A|, гіпотенуза = |AB|',
    baseLeg: seg.lengthP2,
    riseLeg: Math.abs(seg.dy),
    baseLabel: `A₂B₂ = ${fmt(seg.lengthP2, 3)}`,
    riseLabel: `Δy = ${fmt(Math.abs(seg.dy), 3)}`,
    baseColor: '#0ea5e9',
    riseColor: C.rise2,
    angleLabel: `β = ${fmt(seg.angleToP2, 1)}°`,
  }

  const rows: Array<[string, string]> = [
    ['A', `${seg.from.name} (${fmt(seg.from.x)}; ${fmt(seg.from.y)}; ${fmt(seg.from.z)})`],
    ['B', `${seg.to.name} (${fmt(seg.to.x)}; ${fmt(seg.to.y)}; ${fmt(seg.to.z)})`],
    ['Δx / Δy / Δz', `${fmt(seg.dx)} / ${fmt(seg.dy)} / ${fmt(seg.dz)}`],
    ['|AB| (натуральна)', fmt(seg.length, 3)],
    ['Π₁ (X,Y) → L', fmt(seg.lengthP1, 3)],
    ['Π₂ (X,Z) → L', fmt(seg.lengthP2, 3)],
    ['Π₃ (Y,Z) → L', fmt(seg.lengthP3, 3)],
    ['Кути α / β / γ', `${fmt(seg.angleToP1, 1)}° / ${fmt(seg.angleToP2, 1)}° / ${fmt(seg.angleToP3, 1)}°`],
  ]

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Натуральна довжина ${seg.label}`}
      onClick={onClose}
    >
      <div
        className="my-4 w-full max-w-4xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="font-mono text-sm font-bold text-ink">
              Натуральна довжина відрізка {seg.label}
            </h2>
            <p className="text-[11px] text-slate-500">
              Метод прямокутного трикутника · {seg.positionLabel}
            </p>
          </div>
          <button className="btn pointer-events-auto h-8 w-8 !p-0 !text-base" onClick={onClose} title="Закрити (Esc)">
            ✕
          </button>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <figure>
            <figcaption className="mb-1 font-mono text-[11px] font-bold tracking-wide text-slate-600">
              {tr1.title}
            </figcaption>
            <TriangleBig spec={tr1} />
          </figure>
          <figure>
            <figcaption className="mb-1 font-mono text-[11px] font-bold tracking-wide text-slate-600">
              {tr2.title}
            </figcaption>
            <TriangleBig spec={tr2} />
          </figure>
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <div className="mb-2 font-mono text-[11px] font-bold tracking-wide text-slate-600">
            Аналітичні дані
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-2 border-b border-slate-100 py-0.5 font-mono text-[11px]">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-bold tabular-nums text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}