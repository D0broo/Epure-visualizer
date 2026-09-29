import type {
  AnalysisReport,
  AxisMembership,
  CompetingPair,
  GeoPoint,
  LineTrace,
  PlaneMembership,
  SegmentAnalysis,
  SegmentPosition,
  TraceCalc,
} from '../types'

/** Допустима відносна похибка порівняння з нулем. */
const EPS = 1e-9

export const approxZero = (v: number): boolean => Math.abs(v) < EPS

/** Формат числа: обрізає хвостові нулі, послідовно. */
export const fmt = (v: number, digits = 3): string => {
  if (!Number.isFinite(v)) return '—'
  const m = 10 ** digits
  const r = Math.round(v * m) / m
  if (Object.is(r, -0)) return '0'
  return String(r)
}

export interface SegmentDelta {
  dx: number
  dy: number
  dz: number
  length: number
}

/** Різниця координат і натуральна довжина вектора. */
export function delta(a: GeoPoint, b: GeoPoint): SegmentDelta {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  return { dx, dy, dz, length: Math.hypot(dx, dy, dz) }
}

/**
 * Класифікація положення прямої у просторі відносно площин проєкцій.
 * Рівневі прямі паралельні площині → одна з різниць дорівнює 0.
 * Проєціювальні прямі перпендикулярні площині → дві різниці дорівнюють 0.
 */
export function classifySegment(dx: number, dy: number, dz: number): { position: SegmentPosition; label: string } {
  const zx = approxZero(dx)
  const zy = approxZero(dy)
  const zz = approxZero(dz)

  if (zx && zy && zz) return { position: 'нульова', label: 'вироджений (точка)' }

  // Перпендикулярність до площини проєкцій (проєціювальні прямі).
  if (zx && zy) return { position: 'проєціювальна-П1', label: 'горизонтально-проєціювальна (⊥ П1)' }
  if (zx && zz) return { position: 'проєціювальна-П2', label: 'фронтально-проєціювальна (⊥ П2)' }
  if (zy && zz) return { position: 'проєціювальна-П3', label: 'профільно-проєціювальна (⊥ П3)' }

  // Рівневі прямі (паралельні площині проєкцій).
  if (zz) return { position: 'горизонталь', label: 'горизонталь (∥ П1)' }
  if (zy) return { position: 'фронталь', label: 'фронталь (∥ П2)' }
  if (zx) return { position: 'профільна', label: 'профільна (∥ П3)' }

  return { position: 'лог', label: 'пряма загального положення' }
}

/**
 * Правила побудови слідів: яка координата обнуляється, за якою формулою
 * рахується параметр t і як позначається слід. Єдине джерело правди і для
 * математики, і для текстових пояснень в інтерфейсі.
 */
export const TRACE_RULES: ReadonlyArray<{
  plane: 'П1' | 'П2' | 'П3'
  zeroCoord: 'x' | 'y' | 'z'
  label: string
  planeLabel: string
  cond: string
  tFormula: string
}> = [
  {
    plane: 'П1',
    zeroCoord: 'z',
    label: 'M₁',
    planeLabel: 'Π₁ · горизонтальна (X, Y)',
    cond: 'z = 0',
    tFormula: '−z_A / (z_B − z_A)',
  },
  {
    plane: 'П2',
    zeroCoord: 'y',
    label: 'N₂',
    planeLabel: 'Π₂ · фронтальна (X, Z)',
    cond: 'y = 0',
    tFormula: '−y_A / (y_B − y_A)',
  },
  {
    plane: 'П3',
    zeroCoord: 'x',
    label: 'K₃',
    planeLabel: 'Π₃ · профільна (Y, Z)',
    cond: 'x = 0',
    tFormula: '−x_A / (x_B − x_A)',
  },
]

/**
 * Покроковий розрахунок слідів прямої A→B по всіх трьох площинах.
 *
 * Пряма задана параметрично P(t) = A + t·(B − A). Слід на площині — це те
 * значення t, за якого координата площини дорівнює 0: t = −a₀ / Δ.
 *
 * На відміну від {@link tracesOfLine}, повертає записи і для випадків, коли
 * сліду немає (t = null), щоб можна було показати, чому він відсутній.
 */
export function traceCalcs(a: GeoPoint, b: GeoPoint): TraceCalc[] {
  const degenerate = approxZero(b.x - a.x) && approxZero(b.y - a.y) && approxZero(b.z - a.z)
  const upper = (c: 'x' | 'y' | 'z') => c.toUpperCase()

  return TRACE_RULES.map((c) => {
    const a0 = a[c.zeroCoord]
    const delta = b[c.zeroCoord] - a0
    const base = { plane: c.plane, planeLabel: c.planeLabel, label: c.label, zeroCoord: c.zeroCoord, a0, delta }

    if (approxZero(delta)) {
      const note = degenerate
        ? `відрізок вироджений (${a.name} = ${b.name}) — прямої немає`
        : approxZero(a0)
          ? `${a.name} лежить у площині, тож вся пряма лежить у ній — слідом є вся пряма, а не точка`
          : `${upper(c.zeroCoord)}: ${fmt(a0)} = ${fmt(b[c.zeroCoord])}, тому Δ = 0 — пряма ∥ площині й не перетинає її (слід нескінченно віддалений)`
      return { ...base, t: null, trace: null, note }
    }

    const t = -a0 / delta
    const trace: LineTrace = {
      plane: c.plane,
      zeroCoord: c.zeroCoord,
      t,
      onSegment: t >= 0 && t <= 1,
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y),
      z: a.z + t * (b.z - a.z),
      label: c.label,
    }

    const note = !trace.onSegment
      ? t < 0
        ? `t < 0 — слід лежить на прямій за точкою ${a.name}`
        : `t > 1 — слід лежить на прямій за точкою ${b.name}`
      : approxZero(t)
        ? `t = 0 — слід збігається з точкою ${a.name}`
        : approxZero(t - 1)
          ? `t = 1 — слід збігається з точкою ${b.name}`
          : 'слід усередині відрізка'

    return { ...base, t, trace, note }
  })
}

/**
 * Сліди прямої: точки перетину прямої A→B із площинами проєкцій.
 * Площина Π1 відповідає z=0, Π2 — y=0, Π3 — x=0.
 * Прямі, паралельні площині, слідів не мають — такі записи відкидаються.
 */
export function tracesOfLine(a: GeoPoint, b: GeoPoint): LineTrace[] {
  return traceCalcs(a, b)
    .map((c) => c.trace)
    .filter((tr): tr is LineTrace => tr !== null)
}

/** Аналітичний опис одного відрізка. */
export function analyzeSegment(a: GeoPoint, b: GeoPoint): SegmentAnalysis {
  const { dx, dy, dz } = delta(a, b)
  const len = Math.hypot(dx, dy, dz)
  const { position, label: positionLabel } = classifySegment(dx, dy, dz)

  const safeAngle = (sin: number): number => {
    const c = Math.max(-1, Math.min(1, sin))
    return (Math.asin(c) * 180) / Math.PI
  }
  const sin1 = len > 0 ? Math.abs(dz) / len : 0
  const sin2 = len > 0 ? Math.abs(dy) / len : 0
  const sin3 = len > 0 ? Math.abs(dx) / len : 0

  return {
    from: a,
    to: b,
    label: `${a.name}${b.name}`,
    dx,
    dy,
    dz,
    length: len,
    lengthP1: Math.hypot(dx, dy),
    lengthP2: Math.hypot(dx, dz),
    lengthP3: Math.hypot(dy, dz),
    angleToP1: safeAngle(sin1),
    angleToP2: safeAngle(sin2),
    angleToP3: safeAngle(sin3),
    position,
    positionLabel,
    traces: tracesOfLine(a, b),
  }
}

/** Площини проєкцій, на яких лежить точка (при умові координата = 0). */
export function planeMemberships(p: GeoPoint): PlaneMembership[] {
  const res: PlaneMembership[] = []
  if (approxZero(p.z)) res.push({ plane: 'П1', label: 'горизонтальна площина проєкцій (Π1: XOY)', zeroCoord: 'z' })
  if (approxZero(p.y)) res.push({ plane: 'П2', label: 'фронтальна площина проєкцій (Π2: XOZ)', zeroCoord: 'y' })
  if (approxZero(p.x)) res.push({ plane: 'П3', label: 'профільна площина проєкцій (Π3: YOZ)', zeroCoord: 'x' })
  return res
}

/** Осі координат, на яких лежить точка (при умові дві координати = 0). */
export function axisMemberships(p: GeoPoint): AxisMembership[] {
  const res: AxisMembership[] = []
  if (approxZero(p.y) && approxZero(p.z)) res.push({ axis: 'Ox', label: 'вісь Ox', zeroCoords: ['y', 'z'] })
  if (approxZero(p.x) && approxZero(p.z)) res.push({ axis: 'Oy', label: 'вісь Oy', zeroCoords: ['x', 'z'] })
  if (approxZero(p.x) && approxZero(p.y)) res.push({ axis: 'Oz', label: 'вісь Oz', zeroCoords: ['x', 'y'] })
  return res
}

const same = (a: number, b: number) => approxZero(a - b)

/** Пошук пар конкуруючих точок (збіг проєкцій на одній з площин). */
export function findCompeting(points: GeoPoint[]): CompetingPair[] {
  const pairs: CompetingPair[] = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]
      const b = points[j]

      if (same(a.x, b.x) && same(a.z, b.z) && !same(a.y, b.y)) {
        const nearer = a.y > b.y
        pairs.push({
          kind: 'фронтально-конкуруючі (П2)',
          aIndex: i,
          bIndex: j,
          a,
          b,
          description: `на П2 видима ближча до спостерігача — ${
            nearer ? a.name : b.name
          } (Y=${fmt(nearer ? a.y : b.y)}), за нею — ${nearer ? b.name : a.name} (Y=${fmt(nearer ? b.y : a.y)})`,
        })
      }

      if (same(a.x, b.x) && same(a.y, b.y) && !same(a.z, b.z)) {
        const upper = a.z > b.z
        pairs.push({
          kind: 'горизонтально-конкуруючі (П1)',
          aIndex: i,
          bIndex: j,
          a,
          b,
          description: `верхня на П1 — ${
            upper ? a.name : b.name
          } (Z=${fmt(upper ? a.z : b.z)}), нижня — ${upper ? b.name : a.name} (Z=${fmt(upper ? b.z : a.z)})`,
        })
      }

      if (same(a.y, b.y) && same(a.z, b.z) && !same(a.x, b.x)) {
        pairs.push({
          kind: 'профільно-конкуруючі (П3)',
          aIndex: i,
          bIndex: j,
          a,
          b,
          description: `лівіша на П3 — ${a.x < b.x ? a.name : b.name}, правіша — ${a.x < b.x ? b.name : a.name}`,
        })
      }
    }
  }
  return pairs
}

/** Повний аналітичний звіт за списком точок (ламані по групах). */
export function analyzePoints(points: GeoPoint[]): AnalysisReport {
  const segments: SegmentAnalysis[] = []
  for (let i = 0; i < points.length - 1; i++) {
    // Відрізок існує лише між сусідніми точками однієї групи (однієї прямої).
    if (points[i].group !== points[i + 1].group) continue
    segments.push(analyzeSegment(points[i], points[i + 1]))
  }

  const totalLength = segments.length > 0 ? segments.reduce((s, seg) => s + seg.length, 0) : null

  const onPlanes = points
    .map((point) => ({ point, memberships: planeMemberships(point) }))
    .filter((e) => e.memberships.length > 0)

  const onAxes = points
    .map((point) => ({ point, memberships: axisMemberships(point) }))
    .filter((e) => e.memberships.length > 0)

  return {
    pointCount: points.length,
    segments,
    totalLength,
    onPlanes,
    onAxes,
    competing: findCompeting(points),
  }
}

/** Межі координат для нормалізації зображення. */
export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export function computeBounds(points: GeoPoint[]): Bounds {
  if (points.length === 0) {
    return { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 }
  }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const zs = points.map((p) => p.z)
  const pad = (mn: number, mx: number) => {
    const span = mx - mn || 2
    return [mn - span * 0.15, mx + span * 0.15] as const
  }
  const [minX, maxX] = pad(Math.min(...xs), Math.max(...xs))
  const [minY, maxY] = pad(Math.min(...ys), Math.max(...ys))
  const [minZ, maxZ] = pad(Math.min(...zs), Math.max(...zs))
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

/** Правильна побудова (P, Q) — мінімальна з різниць Х координат для засічок. */
export function niceStep(span: number, targetTicks = 5): number {
  if (span <= 0) return 1
  const raw = span / targetTicks
  const pow = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / pow
  const nice = norm < 1 ? 1 : norm < 2 ? 2 : norm < 5 ? 5 : 10
  return nice * pow
}