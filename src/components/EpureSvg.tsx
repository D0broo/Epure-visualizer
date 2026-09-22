import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { GeoPoint } from '../types'
import { computeBounds, fmt, niceStep, tracesOfLine } from '../math/epure'
import { groupColor } from '../palette'

const C = {
  ink: '#1c2733',
  wire: '#2563eb',
  gray: '#94a3b8',
  grid: '#e2e8f0',
  tick: '#64748b',
  p1: '#d97706',
  p2: '#0284c7',
  p3: '#7c3aed',
  dim: '#475569',
  trace: '#475569',
  select: '#f59e0b',
}

interface EpureSvgProps {
  points: GeoPoint[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}

interface ViewOpts {
  grid: boolean
  dims: boolean
  coords: boolean
  links: boolean
  p3: boolean
  bisector: boolean
  traces: boolean
}

const DEFAULT_OPTS: ViewOpts = {
  grid: true,
  dims: true,
  coords: false,
  links: true,
  p3: true,
  bisector: true,
  traces: true,
}

const W = 1500
const H = 620
const mL = 92
const mT = 44
const mB = 56
const mR = 46

interface Layout {
  s: number
  sx: (x: number) => number
  sy2: (z: number) => number
  sy1: (y: number) => number
  p3x: (y: number) => number
  axisY: number
  c30: number
  xTicks: number[]
  zTicks: number[]
  yTicks: number[]
}

function buildLayout(points: GeoPoint[]): Layout {
  const { minX, maxX, minY, maxY, minZ, maxZ } = computeBounds(points)
  const x0 = Math.min(0, minX)
  const x1 = Math.max(0, maxX)
  const z0 = Math.min(0, minZ)
  const z1 = Math.max(0, maxZ)
  const y0 = Math.min(0, minY)
  const y1 = Math.max(0, maxY)

  const xSpan = Math.max(x1 - x0, 1)
  const zSpan = Math.max(z1 - z0, 1)
  const ySpan = Math.max(y1 - y0, 1)

  let s = Math.min(
    ((W - mL - mR) * 0.62) / xSpan,
    (H / 2 - mT) / zSpan,
    (H / 2 - mB) / ySpan,
    (H / 2 - mT) / ySpan,
  )

  const c30Base = mL + (x1 - x0) * s + 46
  const rightAvail = W - mR - c30Base
  const sRight = (rightAvail * 0.94) / ySpan
  if (sRight < s) s = sRight

  const c30 = mL + (x1 - x0) * s + 46
  const axisY = H / 2
  const sx = (x: number) => mL + (x - x0) * s
  const sy2 = (z: number) => axisY - z * s
  const sy1 = (y: number) => axisY + y * s
  const p3x = (y: number) => c30 + y * s

  const ticks = (lo: number, hi: number, span: number) => {
    const step = niceStep(span, 6)
    const out: number[] = []
    for (let k = Math.ceil(lo / step); k <= Math.floor(hi / step); k++) if (k !== 0) out.push(k * step)
    return out
  }

  return {
    s,
    sx,
    sy2,
    sy1,
    p3x,
    axisY,
    c30,
    xTicks: ticks(x0, x1, x1 - x0),
    zTicks: ticks(z0, z1, z1 - z0),
    yTicks: ticks(y0, y1, y1 - y0),
  }
}

interface DimSeg {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  color: string
}

/** Нормалізований перпендикуляр до відрізка в екранних координатах. */
function perp(x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  return [-dy / len, dx / len]
}

export function EpureSvg({ points, selectedId = null, onSelect }: EpureSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [opts, setOpts] = useState<ViewOpts>(DEFAULT_OPTS)
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 })
  const [cursor, setCursor] = useState<{ x: number; y: number; label: string } | null>(null)
  const drag = useRef<{ px: number; py: number } | null>(null)

  const layout = useMemo(() => buildLayout(points), [points])
  const { s, sx, sy2, sy1, p3x, c30, axisY, xTicks, zTicks, yTicks } = layout
  const ox = sx(0)

  // Розмірні лінії для всіх трьох проєкцій.
  const dims = useMemo(() => {
    const p2: DimSeg[] = []
    const p1: DimSeg[] = []
    const p3: DimSeg[] = []
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      const col = groupColor(a.group)
      const len = (v: number) => (v > 1e-6 ? fmt(v, 2) : '0')

      const d2x = sx(b.x) - sx(a.x)
      const d2y = sy2(b.z) - sy2(a.z)
      const lp2 = Math.hypot(d2x, d2y)
      if (lp2 > 8) {
        let [nx, ny] = perp(sx(a.x), sy2(a.z), sx(b.x), sy2(b.z))
        if (ny > 0) {
          nx = -nx
          ny = -ny
        }
        p2.push({ x1: sx(a.x) + nx * 16, y1: sy2(a.z) + ny * 16, x2: sx(b.x) + nx * 16, y2: sy2(b.z) + ny * 16, label: len(lp2), color: col })
      }

      const d1x = sx(b.x) - sx(a.x)
      const d1y = sy1(b.y) - sy1(a.y)
      const lp1 = Math.hypot(d1x, d1y)
      if (lp1 > 8) {
        let [nx, ny] = perp(sx(a.x), sy1(a.y), sx(b.x), sy1(b.y))
        if (ny < 0) {
          nx = -nx
          ny = -ny
        }
        p1.push({ x1: sx(a.x) + nx * 18, y1: sy1(a.y) + ny * 18, x2: sx(b.x) + nx * 18, y2: sy1(b.y) + ny * 18, label: len(lp1), color: col })
      }

      const d3x = p3x(b.y) - p3x(a.y)
      const d3y = sy2(b.z) - sy2(a.z)
      const lp3 = Math.hypot(d3x, d3y)
      if (lp3 > 8) {
        let [nx, ny] = perp(p3x(a.y), sy2(a.z), p3x(b.y), sy2(b.z))
        if (nx < 0) {
          nx = -nx
          ny = -ny
        }
        p3.push({ x1: p3x(a.y) + nx * 16, y1: sy2(a.z) + ny * 16, x2: p3x(b.y) + nx * 16, y2: sy2(b.z) + ny * 16, label: len(lp3), color: col })
      }
    }
    return { p2, p1, p3 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, s, c30])

  const traces = useMemo(
    () => (opts.traces ? points.slice(0, -1).map((p, i) => tracesOfLine(p, points[i + 1])) : points.slice(0, -1).map(() => [])),
    [points, opts.traces],
  )

  // Розбиваємо точки на послідовні групи (прямі одного кольору).
  const runs = useMemo(() => {
    const out: GeoPoint[][] = []
    for (const p of points) {
      const last = out[out.length - 1]
      if (last && last[last.length - 1].group === p.group) last.push(p)
      else out.push([p])
    }
    return out.filter((r) => r.length > 1)
  }, [points])

  // Зум колесом, чутливо до курсора.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setView((v) => {
        const k = Math.min(8, Math.max(0.3, v.k * Math.exp(-e.deltaY * 0.0015)))
        const rect = svg.getBoundingClientRect()
        const px = ((e.clientX - rect.left) / rect.width) * W
        const py = ((e.clientY - rect.top) / rect.height) * H
        const wx = (px - v.tx) / v.k
        const wy = (py - v.ty) / v.k
        return { k, tx: px - wx * k, ty: py - wy * k }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const toSvg = (clientX: number, clientY: number): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    return [((clientX - rect.left) / rect.width) * W, ((clientY - rect.top) / rect.height) * H]
  }

  const panAcc = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panRaf = useRef<number | null>(null)

  // Поставити зсув: накопичуємо дельти й застосовуємо один раз на кадр (requestAnimationFrame),
  // щоб не перерисовувати великий SVG на кожен pointermove.
  const commitPan = (dx: number, dy: number) => {
    panAcc.current.x += dx
    panAcc.current.y += dy
    if (panRaf.current != null) return
    panRaf.current = requestAnimationFrame(() => {
      panRaf.current = null
      const { x, y } = panAcc.current
      panAcc.current = { x: 0, y: 0 }
      if (x === 0 && y === 0) return
      setView((v) => ({ ...v, tx: v.tx + x, ty: v.ty + y }))
    })
  }

  useEffect(() => {
    return () => {
      if (panRaf.current != null) cancelAnimationFrame(panRaf.current)
    }
  }, [])

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const [x, y] = toSvg(e.clientX, e.clientY)
    drag.current = { px: x, py: y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const [x, y] = toSvg(e.clientX, e.clientY)
    const last = drag.current
    if (last) {
      // Обчислюємо дельту синхронно й лише числа передаємо в оновлювач стану,
      // бо React може викликати його асинхронно — після обнуління drag.current.
      commitPan(x - last.px, y - last.py)
      drag.current = { px: x, py: y }
      return
    }
    if (points.length === 0) return
    const wx = (x - view.tx) / view.k
    const wy = (y - view.ty) / view.k
    let label: string
    if (wy < axisY) {
      const zp = (axisY - wy) / s
      if (wx >= c30 && opts.p3) label = `Π₃ · y=${fmt((wx - c30) / s, 2)}  z=${fmt(zp, 2)}`
      else label = `Π₂ · x=${fmt((wx - mL) / s, 2)}  z=${fmt(zp, 2)}`
    } else {
      label = `Π₁ · x=${fmt((wx - mL) / s, 2)}  y=${fmt((wy - axisY) / s, 2)}`
    }
    setCursor({ x: wx, y: wy, label })
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  if (points.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        Додайте точки для побудови епюра Монжа
      </div>
    )
  }

  const p2Dots = points.map((p) => ({ p, x: sx(p.x), y: sy2(p.z) }))
  const p1Dots = points.map((p) => ({ p, x: sx(p.x), y: sy1(p.y) }))
  const p3Dots = points.map((p) => ({ p, x: p3x(p.y), y: sy2(p.z) }))

  const selColor = (id: string) => (id === selectedId ? C.select : C.ink)

  const groupTransform = `translate(${view.tx} ${view.ty}) scale(${view.k})`

  return (
    <div className="relative h-full w-full select-none overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full touch-none select-none"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Епюр Монжа — комплексне креслення"
        onDragStart={(e) => e.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          drag.current = null
          setCursor(null)
        }}
      >
        <g transform={groupTransform}>
          <rect x={0} y={0} width={W} height={H / 2} fill="#f8fafc" />
          <rect x={0} y={H / 2} width={W} height={H / 2} fill="#f1f5f9" />
          {opts.p3 && <rect x={c30} y={0} width={W - c30} height={H / 2} fill="#f5f3ff" />}

          <text x={mL + 6} y={mT - 18} fontSize={12} fill={C.tick} fontFamily="monospace" fontWeight={600}>
            Π₂ · фронтальна (X, Z)
          </text>
          <text x={mL + 6} y={H - mB + 20} fontSize={12} fill={C.tick} fontFamily="monospace" fontWeight={600}>
            Π₁ · горизонтальна (X, Y)
          </text>
          {opts.p3 && (
            <text x={c30 + 6} y={mT - 18} fontSize={12} fill={C.tick} fontFamily="monospace" fontWeight={600}>
              Π₃ · профільна (Y, Z)
            </text>
          )}

          {opts.grid && (
            <>
              {xTicks.map((v) => (
                <line key={`gx${v}`} x1={sx(v)} y1={mT} x2={sx(v)} y2={H - mB} stroke={C.grid} strokeWidth={1} />
              ))}
              {zTicks.map((v) => (
                <line key={`gz${v}`} x1={mL} y1={sy2(v)} x2={Math.max(c30, W - mR)} y2={sy2(v)} stroke={C.grid} strokeWidth={1} />
              ))}
              {yTicks.map((v) => (
                <line key={`gy${v}`} x1={mL} y1={sy1(v)} x2={W - mR} y2={sy1(v)} stroke={C.grid} strokeWidth={1} />
              ))}
              {opts.p3 &&
                yTicks.map((v) => (
                  <line key={`gp3${v}`} x1={c30} y1={sy2(v)} x2={W - mR} y2={sy2(v)} stroke={C.grid} strokeWidth={1} />
                ))}
            </>
          )}

          {/* Ось Ox */}
          <line x1={mL - 10} y1={axisY} x2={W - mR} y2={axisY} stroke={C.ink} strokeWidth={1.6} />
          <path d={`M ${W - mR} ${axisY} l -8 -3.5 v 7 z`} fill={C.ink} />
          <text x={W - mR - 5} y={axisY - 9} fontSize={14} fontStyle="italic" fill={C.ink} fontFamily="serif" fontWeight={700}>
            x
          </text>

          {/* Осі Oz (П2) та Oy (П1) */}
          <line x1={ox} y1={mT} x2={ox} y2={H - mB} stroke={C.ink} strokeWidth={1.6} />
          <path d={`M ${ox} ${mT} l -3.5 8 h 7 z`} fill={C.ink} />
          <text x={ox + 7} y={mT + 4} fontSize={14} fontStyle="italic" fill={C.ink} fontFamily="serif" fontWeight={700}>
            z
          </text>
          <path d={`M ${ox} ${H - mB} l -3.5 -8 h 7 z`} fill={C.ink} />
          <text x={ox + 7} y={H - mB - 5} fontSize={14} fontStyle="italic" fill={C.ink} fontFamily="serif" fontWeight={700}>
            y
          </text>
          <circle cx={ox} cy={axisY} r={3} fill="#fff" stroke={C.ink} strokeWidth={1.6} />
          <text x={ox - 8} y={axisY + 16} fontSize={13} fontStyle="italic" fill={C.ink} fontFamily="serif" fontWeight={700}>
            O
          </text>

          {/* Осі Π₃ */}
          {opts.p3 && (
            <>
              <line x1={c30} y1={mT} x2={c30} y2={axisY} stroke={C.ink} strokeWidth={1.6} />
              <path d={`M ${c30} ${mT} l -3.5 8 h 7 z`} fill={C.ink} />
              <text x={c30 - 7} y={mT + 4} fontSize={14} fontStyle="italic" fill={C.ink} fontFamily="serif" fontWeight={700}>
                z
              </text>
              <line x1={c30} y1={axisY} x2={W - mR} y2={axisY} stroke={C.ink} strokeWidth={1.6} />
              <path d={`M ${W - mR} ${axisY} l -8 -3.5 v 7 z`} fill={C.ink} />
              <text x={W - mR - 4} y={axisY - 9} fontSize={14} fontStyle="italic" fill={C.ink} fontFamily="serif" fontWeight={700}>
                y
              </text>
              <circle cx={c30} cy={axisY} r={3} fill="#fff" stroke={C.ink} strokeWidth={1.6} />
              <text x={c30 + 6} y={axisY - 9} fontSize={13} fontStyle="italic" fill={C.ink} fontFamily="serif" fontWeight={700}>
                O₃
              </text>
            </>
          )}

          {/* Засічки */}
          {xTicks.map((v) => (
            <g key={`tx${v}`}>
              <line x1={sx(v)} y1={axisY - 4} x2={sx(v)} y2={axisY + 4} stroke={C.tick} strokeWidth={1.2} />
              <text x={sx(v)} y={axisY + 17} fontSize={10} textAnchor="middle" fill={C.tick} fontFamily="monospace">
                {fmt(v, 1)}
              </text>
            </g>
          ))}
          {zTicks.map((v) => (
            <g key={`tz${v}`}>
              <line x1={ox - 4} y1={sy2(v)} x2={ox + 4} y2={sy2(v)} stroke={C.tick} strokeWidth={1.2} />
              <text x={ox - 7} y={sy2(v) + 3.5} fontSize={10} textAnchor="end" fill={C.tick} fontFamily="monospace">
                {fmt(v, 1)}
              </text>
              {opts.p3 && (
                <>
                  <line x1={c30 - 4} y1={sy2(v)} x2={c30 + 4} y2={sy2(v)} stroke={C.tick} strokeWidth={1.2} />
                  <text x={c30 + 7} y={sy2(v) + 3.5} fontSize={10} fill={C.tick} fontFamily="monospace">
                    {fmt(v, 1)}
                  </text>
                </>
              )}
            </g>
          ))}
          {yTicks.map((v) => (
            <g key={`ty${v}`}>
              <line x1={ox - 4} y1={sy1(v)} x2={ox + 4} y2={sy1(v)} stroke={C.tick} strokeWidth={1.2} />
              <text x={ox + 7} y={sy1(v) + 3.5} fontSize={10} fill={C.tick} fontFamily="monospace">
                {fmt(v, 1)}
              </text>
            </g>
          ))}

          {/* Лінія зв'язку 45° (постійна) */}
          {opts.bisector &&
            opts.p3 && (
              <line
                x1={c30}
                y1={axisY}
                x2={c30 + (H - mB - axisY) * 0.94}
                y2={H - mB}
                stroke={C.gray}
                strokeWidth={0.8}
                strokeDasharray="5 4"
              />
            )}

          {/* 45° передача Π₁ → Π₃ */}
          {opts.links &&
            opts.p3 &&
            p1Dots.map(({ p, x, y }) => (
              <polyline
                key={`b45-${p.id}`}
                points={`${x},${y} ${p3x(p.y)},${y} ${p3x(p.y)},${sy2(p.z)}`}
                fill="none"
                stroke={C.gray}
                strokeWidth={0.8}
                strokeDasharray="3 3"
              />
            ))}

          {/* Лінії проєкційного зв'язку A₁–A₂ */}
          {opts.links &&
            points.map((p) => (
              <line
                key={`link-${p.id}`}
                x1={sx(p.x)}
                y1={sy2(p.z)}
                x2={sx(p.x)}
                y2={sy1(p.y)}
                stroke={selectedId === p.id ? C.select : C.gray}
                strokeWidth={selectedId === p.id ? 1.4 : 0.8}
                strokeDasharray="4 3"
              />
            ))}

          {/* Проєкції ламаних (по групах) */}
          {runs.length > 0 && (
            <>
              {runs.map((run, ri) => {
                const col = groupColor(run[0].group)
                const r2 = run.map((p) => `${sx(p.x)},${sy2(p.z)}`).join(' ')
                const r1 = run.map((p) => `${sx(p.x)},${sy1(p.y)}`).join(' ')
                const r3 = run.map((p) => `${p3x(p.y)},${sy2(p.z)}`).join(' ')
                return (
                  <g key={`run-${ri}`}>
                    <polyline points={r2} fill="none" stroke={col} strokeWidth={1.8} />
                    <polyline points={r1} fill="none" stroke={col} strokeWidth={1.8} />
                    {opts.p3 && <polyline points={r3} fill="none" stroke={col} strokeWidth={1.3} />}
                  </g>
                )
              })}
            </>
          )}

          {/* Сліди прямих */}
          {traces.flatMap((trs, i) =>
            trs.map((tr, j) => {
              const draw = tr.plane === 'П1' ? { x: sx(tr.x), y: sy1(tr.y) } : tr.plane === 'П2' ? { x: sx(tr.x), y: sy2(tr.z) } : { x: p3x(tr.y), y: sy2(tr.z) }
              const mark = tr.plane === 'П1' ? 'M₁' : tr.plane === 'П2' ? 'N₂' : 'K₃'
              return (
                <g key={`tr-${i}-${j}`}>
                  <rect x={draw.x - 3} y={draw.y - 3} width={6} height={6} fill="none" stroke={C.trace} strokeWidth={1} strokeDasharray="2 1.5" />
                  <text x={Math.min(draw.x + 5, W - mR - 24)} y={draw.y - 4} fontSize={10} fill={C.trace} fontFamily="monospace" fontStyle="italic">
                    {mark}
                  </text>
                </g>
              )
            }),
          )}

          {/* Розмірні лінії */}
          {opts.dims && (
            <>
              {dims.p2.map((d, i) => (
                <g key={`dim-p2-${i}`}>
                  <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={d.color} strokeWidth={0.8} />
                  <path d={`M ${d.x1} ${d.y1} l -4 3 v -6 z`} fill={d.color} />
                  <path d={`M ${d.x2} ${d.y2} l 4 3 v -6 z`} fill={d.color} />
                  <text x={(d.x1 + d.x2) / 2} y={(d.y1 + d.y2) / 2 - 4} fontSize={10} textAnchor="middle" fill={d.color} fontFamily="monospace">
                    {d.label}
                  </text>
                </g>
              ))}
              {dims.p1.map((d, i) => (
                <g key={`dim-p1-${i}`}>
                  <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={d.color} strokeWidth={0.8} />
                  <path d={`M ${d.x1} ${d.y1} l -4 3 v -6 z`} fill={d.color} />
                  <path d={`M ${d.x2} ${d.y2} l 4 3 v -6 z`} fill={d.color} />
                  <text x={(d.x1 + d.x2) / 2} y={(d.y1 + d.y2) / 2 + 13} fontSize={10} textAnchor="middle" fill={d.color} fontFamily="monospace">
                    {d.label}
                  </text>
                </g>
              ))}
              {opts.p3 &&
                dims.p3.map((d, i) => (
                  <g key={`dim-p3-${i}`}>
                    <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke={d.color} strokeWidth={0.8} />
                    <path d={`M ${d.x1} ${d.y1} l -4 3 v -6 z`} fill={d.color} />
                    <path d={`M ${d.x2} ${d.y2} l 4 3 v -6 z`} fill={d.color} />
                    <text x={(d.x1 + d.x2) / 2} y={(d.y1 + d.y2) / 2 - 4} fontSize={10} textAnchor="middle" fill={d.color} fontFamily="monospace">
                      {d.label}
                    </text>
                  </g>
                ))}
            </>
          )}

          {/* Координати біля точок */}
          {opts.coords &&
            points.map((p) => (
              <g key={`coord-${p.id}`}>
                <text x={sx(p.x) + 6} y={sy2(p.z) + 16} fontSize={9} fill={C.tick} fontFamily="monospace">
                  ({fmt(p.x, 1)};{fmt(p.z, 1)})
                </text>
                <text x={sx(p.x) + 6} y={sy1(p.y) - 7} fontSize={9} fill={C.tick} fontFamily="monospace">
                  ({fmt(p.x, 1)};{fmt(p.y, 1)})
                </text>
              </g>
            ))}

          {/* Точки Π₂ */}
          {p2Dots.map(({ p, x, y }) => (
            <PointMark
              key={`p2-${p.id}`}
              x={x}
              y={y}
              color={selColor(p.id)}
              label={`${p.name}₂`}
              lx={6}
              ly={-4}
              title={`${p.name}₂ · X=${fmt(p.x)} Z=${fmt(p.z)}`}
              selected={selectedId === p.id}
              onSelect={() => onSelect?.(selectedId === p.id ? null : p.id)}
            />
          ))}
          {/* Точки Π₁ */}
          {p1Dots.map(({ p, x, y }) => (
<PointMark
                key={`p1-${p.id}`}
                x={x}
                y={y}
              color={selColor(p.id)}
              label={`${p.name}₁`}
              lx={6}
              ly={13}
              title={`${p.name}₁ · X=${fmt(p.x)} Y=${fmt(p.y)}`}
              selected={selectedId === p.id}
              onSelect={() => onSelect?.(selectedId === p.id ? null : p.id)}
            />
          ))}
          {/* Точки Π₃ */}
          {opts.p3 &&
            p3Dots.map(({ p, x, y }) => (
<PointMark
                  key={`p3-${p.id}`}
                  x={x}
                  y={y}
                color={selColor(p.id)}
                label={`${p.name}₃`}
                lx={6}
                ly={-4}
                title={`${p.name}₃ · Y=${fmt(p.y)} Z=${fmt(p.z)}`}
                selected={selectedId === p.id}
                onSelect={() => onSelect?.(selectedId === p.id ? null : p.id)}
              />
            ))}

          {/* Хрест-курсор */}
          {cursor && (
            <g pointerEvents="none">
              <line x1={mL} y1={cursor.y} x2={W - mR} y2={cursor.y} stroke={C.select} strokeWidth={0.6} strokeDasharray="2 3" opacity={0.7} />
              <line x1={cursor.x} y1={mT} x2={cursor.x} y2={H - mB} stroke={C.select} strokeWidth={0.6} strokeDasharray="2 3" opacity={0.7} />
            </g>
          )}
        </g>
      </svg>

      {/* Панель вигляду */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex max-w-[430px] flex-wrap items-center gap-x-3 gap-y-1 rounded border border-slate-300 bg-white/85 px-2 py-1.5 font-mono text-[10px] text-slate-600 shadow-sm backdrop-blur">
        <Toggle label="сітка" on={opts.grid} set={(v) => setOpts((o) => ({ ...o, grid: v }))} />
        <Toggle label="Π₃" on={opts.p3} set={(v) => setOpts((o) => ({ ...o, p3: v }))} />
        <Toggle label="зв'язок" on={opts.links} set={(v) => setOpts((o) => ({ ...o, links: v }))} />
        <Toggle label="45°" on={opts.bisector} set={(v) => setOpts((o) => ({ ...o, bisector: v }))} />
        <Toggle label="розміри" on={opts.dims} set={(v) => setOpts((o) => ({ ...o, dims: v }))} />
        <Toggle label="координати" on={opts.coords} set={(v) => setOpts((o) => ({ ...o, coords: v }))} />
        <Toggle label="сліди" on={opts.traces} set={(v) => setOpts((o) => ({ ...o, traces: v }))} />
      </div>

      {/* Масштаб */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        <button className="btn pointer-events-auto h-7 w-7 !p-0 !text-sm" onClick={() => setView((v) => ({ ...v, k: Math.min(8, v.k * 1.4) }))} title="Наблизити">
          +
        </button>
        <button className="btn pointer-events-auto h-7 w-7 !p-0 !text-sm" onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k / 1.4) }))} title="Віддалити">
          −
        </button>
        <button className="btn pointer-events-auto h-7 !px-2" onClick={() => setView({ k: 1, tx: 0, ty: 0 })} title="Скинути масштаб">
          ⟲
        </button>
      </div>

      {/* Курсор */}
      {cursor && (
        <div className="pointer-events-none absolute right-2 bottom-2 z-10 rounded border border-slate-300 bg-white/90 px-2 py-1 font-mono text-[11px] text-slate-700 shadow-sm backdrop-blur">
          {cursor.label}
        </div>
      )}

      {/* Легенда */}
      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-wrap items-center gap-x-4 gap-y-0.5 rounded border border-slate-300 bg-white/80 px-2 py-1 font-mono text-[10px] text-slate-500 backdrop-blur">
        {points.map((p) => p.group).filter((g, i, a) => a.indexOf(g) === i).map((g) => (
          <span key={g} className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-5" style={{ backgroundColor: groupColor(g) }} />
            {g + 1}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-0 w-5 border-t border-dashed border-[#94a3b8]" />
          зв'язок
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#d97706]" />
          Π₁
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#0284c7]" />
          Π₂
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#7c3aed]" />
          Π₃
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 border border-dashed border-[#475569]" />
          слід
        </span>
        <span className="ml-1 whitespace-nowrap text-slate-400">колесо — масштаб · тягніть — зсув · клік — вибір</span>
      </div>
    </div>
  )
}

function PointMark({
  x,
  y,
  color,
  label,
  lx,
  ly,
  title,
  selected,
  onSelect,
}: {
  x: number
  y: number
  color: string
  label: string
  lx: number
  ly: number
  title: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <g style={{ cursor: 'pointer' }} onClick={onSelect}>
      <circle cx={x} cy={y} r={selected ? 5.5 : 3.4} fill={color} stroke="#fff" strokeWidth={1.4} />
      <circle cx={x} cy={y} r={selected ? 7.5 : 0} fill="none" stroke={C.select} strokeWidth={0.8} strokeDasharray="2 1.5" />
      <text x={x + lx} y={y + ly} fontSize={11} fill={color} fontFamily="monospace" fontWeight={700}>
        {label}
      </text>
      <title>{title}</title>
    </g>
  )
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="pointer-events-auto flex cursor-pointer items-center gap-1 select-none">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-3 w-3 accent-sky-600" />
      {label}
    </label>
  )
}
