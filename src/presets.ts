import type { GeoPoint, Preset, PresetId } from './types'

const P: Preset[] = [
  {
    id: 'polyline6',
    label: 'Дві ламані (A–C, D–F)',
    points: [
      { id: 'p-0', name: 'A', x: 2, y: 1, z: 0, group: 0 },
      { id: 'p-1', name: 'B', x: 5, y: 1, z: 3, group: 0 },
      { id: 'p-2', name: 'C', x: 8, y: 3, z: 2, group: 0 },
      { id: 'p-3', name: 'D', x: 6, y: 5, z: 4, group: 1 },
      { id: 'p-4', name: 'E', x: 3, y: 4, z: 5, group: 1 },
      { id: 'p-5', name: 'F', x: 0, y: 3, z: 1, group: 1 },
    ],
  },
  {
    id: 'triangle',
    label: 'Трикутник + висота (2 прямі)',
    points: [
      { id: 'p-0', name: 'A', x: 1, y: 2, z: 0, group: 0 },
      { id: 'p-1', name: 'B', x: 5, y: 1, z: 4, group: 0 },
      { id: 'p-2', name: 'C', x: 4, y: 4, z: 1, group: 0 },
      { id: 'p-3', name: 'D', x: 2.6, y: 2.45, z: 1.6, group: 1 },
      { id: 'p-4', name: 'E', x: 2.6, y: 2.45, z: 4.6, group: 1 },
    ],
  },
  {
    id: 'onPlanes',
    label: 'Точки на площинах і осях',
    points: [
      { id: 'p-0', name: 'A', x: 4, y: 2, z: 0, group: 0 },
      { id: 'p-1', name: 'B', x: 6, y: 0, z: 3, group: 0 },
      { id: 'p-2', name: 'C', x: 0, y: 4, z: 5, group: 0 },
      { id: 'p-3', name: 'D', x: 2, y: 3, z: 5, group: 0 },
      { id: 'p-4', name: 'E', x: 2, y: 3, z: 1.5, group: 1 },
      { id: 'p-5', name: 'F', x: 8, y: 4, z: 0, group: 1 },
      { id: 'p-6', name: 'G', x: 3, y: 0, z: 0, group: 1 },
      { id: 'p-7', name: 'H', x: 3, y: 2, z: 0, group: 2 },
      { id: 'p-8', name: 'I', x: 3, y: 2, z: 4, group: 2 },
    ],
  },
]

// G—на осі Ox, D–E конкуруючі на П1.

export const presets: Preset[] = P

export const presetById = (id: PresetId): Preset | undefined => P.find((pr) => pr.id === id)

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Автоматичне ім'я наступної точки: A, B, ... Z, A₁, B₁, ... */
export function nextPointName(existing: GeoPoint[]): string {
  const used = new Set(existing.map((p) => p.name))
  for (let pass = 0; pass < 26; pass++) {
    for (const l of LETTERS) {
      const name = pass === 0 ? l : `${l}${pass}`
      if (!used.has(name)) return name
    }
  }
  return `P${existing.length}`
}