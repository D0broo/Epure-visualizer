import type { GeoPoint, SegmentPosition } from './types'
import { nextPointName } from './presets'

export interface LineTypeOption {
  id: SegmentPosition
  label: string
}

/** Доступні для генерації типи прямих (відповідають класифікатору у classifySegment). */
export const LINE_TYPES: LineTypeOption[] = [
  { id: 'лог', label: 'Загального положення' },
  { id: 'горизонталь', label: 'Горизонталь (∥ П1)' },
  { id: 'фронталь', label: 'Фронталь (∥ П2)' },
  { id: 'профільна', label: 'Профільна (∥ П3)' },
  { id: 'проєціювальна-П1', label: 'Горизонтально-проєціювальна (⊥ П1)' },
  { id: 'проєціювальна-П2', label: 'Фронтально-проєціювальна (⊥ П2)' },
  { id: 'проєціювальна-П3', label: 'Профільно-проєціювальна (⊥ П3)' },
]

const COORDS = [-6, -5.5, -5, -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]

const rand = () => COORDS[Math.floor(Math.random() * COORDS.length)]

type Axis = 'x' | 'y' | 'z'

const AXES: Axis[] = ['x', 'y', 'z']

/** Осі, різниця по яких має дорівнювати 0 для заданого типу прямої. */
const ZERO_AXES: Record<SegmentPosition, Axis[]> = {
  'лог': [],
  'горизонталь': ['z'],
  'фронталь': ['y'],
  'профільна': ['x'],
  'проєціювальна-П1': ['x', 'y'],
  'проєціювальна-П2': ['x', 'z'],
  'проєціювальна-П3': ['y', 'z'],
  'нульова': ['x', 'y', 'z'],
}

/**
 * Генерує відрізок прямої заданого типу з випадковими координатами
 * (крок 0.5 у межах −6…6). Точки додаються як нова група, імена унікальні.
 */
export function generateLine(type: SegmentPosition, existing: GeoPoint[], group: number): GeoPoint[] {
  const zero = ZERO_AXES[type]
  const a: Record<Axis, number> = { x: rand(), y: rand(), z: rand() }
  const b: Record<Axis, number> = { ...a }
  for (const ax of AXES) {
    if (zero.includes(ax)) continue
    let v = rand()
    while (v === a[ax]) v = rand()
    b[ax] = v
  }

  const coords = [a, b]
  const pts: GeoPoint[] = []
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i]
    pts.push({
      id: `gen-${Date.now()}-${existing.length}-${i}`,
      name: nextPointName(existing.concat(pts)),
      x: c.x,
      y: c.y,
      z: c.z,
      group,
    })
  }
  return pts
}