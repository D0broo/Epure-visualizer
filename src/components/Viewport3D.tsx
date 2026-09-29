import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GeoPoint } from '../types'
import { fmt, niceStep } from '../math/epure'
import { groupColor } from '../palette'

type PlaneId = 'p1' | 'p2' | 'p3'

const COLORS = {
  bg: '#eef1f4',
  gray: '#94a3b8',
  dim: '#475569',
  select: '#f59e0b',
  axisX: '#e11d48', // геометрична X
  axisY: '#16a34a', // геометрична Y
  axisZ: '#2563eb', // геометрична Z
  planeP1: 0x22c55e,
  planeP2: 0x3b82f6,
  planeP3: 0xf59e0b,
} as const

/** Колір маркера/підпису на площині — збігається з кольором самої площини. */
const PLANE_CSS: Record<PlaneId, string> = { p1: '#16a34a', p2: '#2563eb', p3: '#d97706' }

/* ────────────────────────────────────────────────────────────────────
   Система координат у сцені (three.js):
     three.x → геометрична Y (праворуч)
     three.y → геометрична Z (вгору)
     three.z → геометрична X (у глибину)

   Проєкції рахуються НЕ «полями за назвою», а через окремий опис
   площини: proj() кидає точку в координати three, n — одинична
   нормаль, за якою робиться зсув від площини. Раніше тут було два
   транспонування підряд, через що маркери Π₁ і Π₂ опинялися на осі
   симетрії чужих площин і візуально збігалися в одній точці.
   ──────────────────────────────────────────────────────────────────── */
const toThree = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(y, z, x)

interface PlaneSpec {
  id: PlaneId
  /** Підпис сліду: A₁, A₂, A₃. */
  sub: string
  /** Назва площини проєкцій. */
  title: string
  color: number
  /** Проєкція геометричної точки в координати three (без зсуву від площини). */
  proj: (p: GeoPoint) => [number, number, number]
  /** Одинична нормаль площини в three. */
  n: [number, number, number]
  /** Поворот фігур, які мають лежати в площині (нормаль локально +Z). */
  rot: [number, number, number]
  /** Напрям зсуву підпису вздовж площини, щоб не накривати маркер. */
  labOff: [number, number, number]
}

const PLANES: PlaneSpec[] = [
  // Π₁ — горизонтальна XOY: z = 0  →  three.y = 0
  {
    id: 'p1',
    sub: '₁',
    title: 'Π₁ · горизонтальна (X, Y)',
    color: COLORS.planeP1,
    proj: (p) => [p.y, 0, p.x],
    n: [0, 1, 0],
    rot: [-Math.PI / 2, 0, 0],
    labOff: [1, 0, 1],
  },
  // Π₂ — фронтальна XOZ: y = 0  →  three.x = 0
  {
    id: 'p2',
    sub: '₂',
    title: 'Π₂ · фронтальна (X, Z)',
    color: COLORS.planeP2,
    proj: (p) => [0, p.z, p.x],
    n: [1, 0, 0],
    rot: [0, Math.PI / 2, 0],
    labOff: [0, 1, 1],
  },
  // Π₃ — профільна YOZ: x = 0  →  three.z = 0
  {
    id: 'p3',
    sub: '₃',
    title: 'Π₃ · профільна (Y, Z)',
    color: COLORS.planeP3,
    proj: (p) => [p.y, p.z, 0],
    n: [0, 0, 1],
    rot: [0, 0, 0],
    labOff: [1, 1, 0],
  },
]

/** Проєкція точки на площину зі зсувом `off` уздовж нормалі (щоб не злипалось із площиною). */
function project(pl: PlaneSpec, p: GeoPoint, off: number): THREE.Vector3 {
  const [a, b, c] = pl.proj(p)
  return new THREE.Vector3(a + pl.n[0] * off, b + pl.n[1] * off, c + pl.n[2] * off)
}

/** Точка площини, задана локальними координатами (lx уздовж осі, ly поперек). */
function onPlane(pl: PlaneSpec, lx: number, ly: number): THREE.Vector3 {
  return new THREE.Vector3(lx, ly, 0).applyEuler(new THREE.Euler(pl.rot[0], pl.rot[1], pl.rot[2]))
}

/* ── Фігурні маркери ─────────────────────────────────────────────── */

type ShapeKind = 'none' | 'sphere' | 'octa' | 'cube' | 'cone' | 'pyramid' | 'ring' | 'disc' | 'cross' | 'xmark' | 'square'

/** Фігури, які мають лежати в площині проєкції (будуються в локальній XY). */
const FLAT_SHAPES = new Set<ShapeKind>(['disc', 'cross', 'xmark', 'square', 'ring'])

const SPACE_SHAPES: Array<{ id: ShapeKind; label: string }> = [
  { id: 'sphere', label: 'куля' },
  { id: 'octa', label: 'октаедр' },
  { id: 'cube', label: 'куб' },
  { id: 'cone', label: 'конус' },
  { id: 'pyramid', label: 'піраміда' },
  { id: 'ring', label: 'тор' },
  { id: 'cross', label: 'хрест' },
  { id: 'none', label: 'без маркера' },
]

const PLANE_SHAPES: Array<{ id: ShapeKind; label: string }> = [
  { id: 'disc', label: 'крапка' },
  { id: 'cross', label: 'хрест +' },
  { id: 'xmark', label: 'хрест ✕' },
  { id: 'square', label: 'рамка' },
  { id: 'ring', label: 'кільце' },
  { id: 'sphere', label: 'куля' },
  { id: 'cube', label: 'куб' },
  { id: 'cone', label: 'конус' },
  { id: 'none', label: 'без маркера' },
]

function buildMarker(kind: ShapeKind, color: THREE.ColorRepresentation, s: number, pl: PlaneSpec | null): THREE.Object3D {
  const g = new THREE.Group()
  if (kind === 'none') return g
  const mat = new THREE.MeshBasicMaterial({ color })
  const thick = s * 0.28
  const solid = (geo: THREE.BufferGeometry, setup?: (m: THREE.Mesh) => void) => {
    const m = new THREE.Mesh(geo, mat)
    setup?.(m)
    m.renderOrder = 4
    g.add(m)
  }
  // Смужка-«олівець» у локальній XY: має помітну товщину навіть під кутом.
  const bar = (len: number, angle: number, px = 0, py = 0) =>
    solid(new THREE.BoxGeometry(len, thick, thick), (m) => {
      m.rotation.z = angle
      m.position.set(px, py, 0)
    })

  switch (kind) {
    case 'sphere':
      solid(new THREE.SphereGeometry(s, 22, 14))
      break
    case 'octa':
      solid(new THREE.OctahedronGeometry(s * 1.3))
      break
    case 'cube':
      solid(new THREE.BoxGeometry(s * 1.6, s * 1.6, s * 1.6))
      break
    case 'cone':
      solid(new THREE.ConeGeometry(s * 0.85, s * 1.8, 22))
      break
    case 'pyramid':
      solid(new THREE.ConeGeometry(s * 1.1, s * 1.9, 4))
      break
    case 'ring':
      solid(new THREE.TorusGeometry(s * 0.8, s * 0.22, 10, 28))
      break
    case 'disc':
      // Циліндр віссю вздовж локального Z — «крапка», добре видна з обох боків.
      solid(
        new THREE.CylinderGeometry(s, s, s * 0.3, 30),
        (m) => {
          m.rotation.x = Math.PI / 2
        },
      )
      break
    case 'cross':
      bar(s * 2, 0)
      bar(s * 2, Math.PI / 2)
      break
    case 'xmark':
      bar(s * 2, Math.PI / 4)
      bar(s * 2, -Math.PI / 4)
      break
    case 'square': {
      const e = s * 0.95
      bar(s * 1.9, 0, 0, e)
      bar(s * 1.9, 0, 0, -e)
      bar(s * 1.9, Math.PI / 2, e, 0)
      bar(s * 1.9, Math.PI / 2, -e, 0)
      break
    }
  }

  if (pl && FLAT_SHAPES.has(kind)) g.rotation.set(pl.rot[0], pl.rot[1], pl.rot[2])
  return g
}

function tagPointId(obj: THREE.Object3D, id: string): void {
  obj.userData.pointId = id
  for (const c of obj.children) tagPointId(c, id)
}

/* ── Налаштування вигляду ─────────────────────────────────────────── */

interface ViewOpts {
  p1: boolean
  p2: boolean
  p3: boolean
  /** Полілінії проєкцій ламаних. */
  poly: boolean
  /** Пунксирні проєкційні зв'язки (точка → її слід на площині). */
  links: boolean
  /** Підписи точок. */
  labels: boolean
  ticks: boolean
  /** Позначення точок у просторі. */
  spaceMarker: ShapeKind
  /** Позначення слідів на площинах. */
  planeMarker: ShapeKind
  /** Розмір маркерів, 0.5…2. */
  size: number
  /** Розведення площин уздовж нормалей, 0…1. */
  spread: number
}

const DEFAULT_OPTS: ViewOpts = {
  p1: true,
  p2: true,
  p3: true,
  poly: true,
  links: true,
  labels: true,
  ticks: true,
  spaceMarker: 'sphere',
  planeMarker: 'disc',
  size: 1,
  spread: 0,
}

/* ── Стан сцени ───────────────────────────────────────────────────── */

interface Viewport3DProps {
  points: GeoPoint[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  animate?: boolean
}

interface SceneState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  dataGroup: THREE.Group
  fxGroup: THREE.Group
  clock: THREE.Clock
  resizeObs: ResizeObserver
  raf: number
  /** Площина: заливка + рамка + сітка (група зміщена вздовж нормалі). */
  planeVisuals: Record<PlaneId, THREE.Group>
  /** Маркери, підписи та полілінії проєкцій — у світових координатах. */
  planeItems: Record<PlaneId, THREE.Group>
  /** Габарит сцени — для кнопок перегляду. */
  ext: number
  tween: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number } | null
}

interface Sweep {
  mesh: THREE.Object3D
  from: THREE.Vector3
  to: THREE.Vector3
  delay: number
  period: number
}

/* ── Геометрія сцени ──────────────────────────────────────────────── */

function makeTextSprite(text: string, color: string, scale: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.font = '74px Consolas, "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 16
  ctx.strokeStyle = 'rgba(238,241,244,0.94)'
  ctx.lineJoin = 'round'
  ctx.strokeText(text, 256, 64)
  ctx.fillStyle = color
  ctx.fillText(text, 256, 64)

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(scale * 4, scale, 1)
  sprite.renderOrder = 10
  return sprite
}

interface Extent {
  /** Габарит (напіврозмір) сцени: визначає розмір площин і маркерів. */
  ext: number
  /** Напіврозмір кожної площини — щоб кожен слід гарантовано потрапляв у свою площину. */
  half: Record<PlaneId, number>
  /** Межі осей для засічок. */
  ax: number
  ay: number
  az: number
}

function sceneExtent(points: GeoPoint[]): Extent {
  if (points.length === 0) {
    return { ext: 3, half: { p1: 3, p2: 3, p3: 3 }, ax: 3, ay: 3, az: 3 }
  }
  const m = (f: (p: GeoPoint) => number) => Math.max(1, ...points.map((p) => Math.abs(f(p))))
  const ax = m((p) => p.x)
  const ay = m((p) => p.y)
  const az = m((p) => p.z)
  return {
    ext: Math.max(ax, ay, az) * 1.3,
    half: { p1: Math.max(ax, ay), p2: Math.max(ax, az), p3: Math.max(ay, az) },
    ax,
    ay,
    az,
  }
}

/** Засічки уздовж [-h, h] (нуль не дублюємо — він вже є на осі). */
function ticksFor(h: number, target = 4): number[] {
  const step = niceStep(h * 2, target)
  const out: number[] = []
  for (let k = -Math.ceil(h / step); k <= Math.ceil(h / step); k++) if (k !== 0) out.push(k * step)
  return out
}

interface AxisSpec {
  letter: string
  color: string
  /** Напрям осі: t → точка. */
  dir: (t: number) => THREE.Vector3
  /** Напрям зсуву підпису від осі. */
  off: (t: number, d: number) => THREE.Vector3
  half: number
}

/**
 * Осі сцени з геометричними підписами: уздовж three.x — геометрична Y,
 * уздовж three.y — геометрична Z, уздовж three.z — геометрична X.
 */
function buildAxes(group: THREE.Group, ext: Extent, labelScale: number, showTicks: boolean): void {
  const len = ext.ext * 1.12
  const axes: AxisSpec[] = [
    {
      letter: 'y',
      color: COLORS.axisY,
      dir: (t) => new THREE.Vector3(t, 0, 0),
      off: (t, d) => new THREE.Vector3(t, d, 0),
      half: ext.ay,
    },
    {
      letter: 'z',
      color: COLORS.axisZ,
      dir: (t) => new THREE.Vector3(0, t, 0),
      off: (t, d) => new THREE.Vector3(d, t, d),
      half: ext.az,
    },
    {
      letter: 'x',
      color: COLORS.axisX,
      dir: (t) => new THREE.Vector3(0, 0, t),
      off: (t, d) => new THREE.Vector3(d, d, t),
      half: ext.ax,
    },
  ]

  const head = len * 1.14
  for (const ax of axes) {
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([ax.dir(-len), ax.dir(head)]),
        new THREE.LineBasicMaterial({ color: ax.color }),
      ),
    )
    const name = makeTextSprite(ax.letter, ax.color, labelScale)
    name.position.copy(ax.dir(head * 1.06))
    group.add(name)

    if (!showTicks) continue
    for (const v of ticksFor(ax.half)) {
      const t = makeTextSprite(fmt(v, 1), COLORS.dim, labelScale * 0.55)
      t.position.copy(ax.off(v, labelScale * 0.42))
      group.add(t)
    }
  }
}

/** Площина проєкцій: заливка, рамка, сітка та підпис (у локальних координатах). */
function buildPlane(pl: PlaneSpec, group: THREE.Group, size: number, labelScale: number): void {
  const half = size / 2

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color: pl.color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
  )
  mesh.rotation.set(...pl.rot)
  mesh.renderOrder = 0
  group.add(mesh)

  const border = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      onPlane(pl, -half, -half),
      onPlane(pl, half, -half),
      onPlane(pl, half, half),
      onPlane(pl, -half, half),
      onPlane(pl, -half, -half),
    ]),
    new THREE.LineBasicMaterial({ color: pl.color, transparent: true, opacity: 0.4 }),
  )
  border.renderOrder = 1
  group.add(border)

  const gridPts: THREE.Vector3[] = []
  for (const v of ticksFor(half, 8)) {
    gridPts.push(onPlane(pl, v, -half), onPlane(pl, v, half))
    gridPts.push(onPlane(pl, -half, v), onPlane(pl, half, v))
  }
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(gridPts),
    new THREE.LineBasicMaterial({ color: pl.color, transparent: true, opacity: 0.16 }),
  )
  grid.renderOrder = 1
  group.add(grid)

  const title = makeTextSprite(pl.title, PLANE_CSS[pl.id], labelScale * 0.85)
  title.position.copy(onPlane(pl, -half * 0.98, -half * 1.04))
  group.add(title)
}

function dashedLine(a: THREE.Vector3, b: THREE.Vector3, color: string, dash: number, gap: number): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b])
  const mat = new THREE.LineDashedMaterial({ color, dashSize: dash, gapSize: gap, transparent: true, opacity: 0.9 })
  const line = new THREE.Line(geo, mat)
  line.computeLineDistances()
  line.renderOrder = 2
  return line
}

function clearGroup(root: THREE.Group): void {
  const toDispose: Array<THREE.BufferGeometry | THREE.Material> = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.geometry) toDispose.push(mesh.geometry)
    if (mesh.material) {
      const m = mesh.material as THREE.Material
      if (Array.isArray(m)) toDispose.push(...m)
      else toDispose.push(m)
    }
  })
  while (root.children.length) root.remove(root.children[0])
  toDispose.forEach((d) => d.dispose())
}

/* ── Побудова даних у сцені ───────────────────────────────────────── */

function rebuildData(st: SceneState, points: GeoPoint[], selectedId: string | null, opts: ViewOpts): void {
  const { dataGroup } = st
  clearGroup(dataGroup)
  for (const pl of PLANES) {
    clearGroup(st.planeVisuals[pl.id])
    clearGroup(st.planeItems[pl.id])
    st.planeVisuals[pl.id].visible = opts[pl.id]
    st.planeItems[pl.id].visible = opts[pl.id]
  }
  st.ext = 3

  if (points.length === 0) return

  const ext = sceneExtent(points)
  st.ext = ext.ext

  const planeSize = Math.max(ext.half.p1, ext.half.p2, ext.half.p3) * 2.15
  const off = ext.ext * 0.012 + opts.spread * ext.ext * 0.85
  const labelScale = ext.ext * 0.1
  const labelOff = ext.ext * 0.12
  const mkPlane = ext.ext * 0.023 * opts.size
  const mkSpace = ext.ext * 0.032 * opts.size
  const dash = ext.ext * 0.028
  const gap = ext.ext * 0.02

  for (const pl of PLANES) {
    buildPlane(pl, st.planeVisuals[pl.id], planeSize, labelScale)
    st.planeVisuals[pl.id].position.set(pl.n[0] * off, pl.n[1] * off, pl.n[2] * off)
  }

  const aux = new THREE.Group()
  dataGroup.add(aux)
  buildAxes(aux, ext, labelScale * 0.9, opts.ticks)

  // Просторовий каркас — окремими прямими (по групах).
  const runs: GeoPoint[][] = []
  for (const p of points) {
    const last = runs[runs.length - 1]
    if (last && last[last.length - 1].group === p.group) last.push(p)
    else runs.push([p])
  }

  for (const run of runs) {
    if (run.length < 2) continue
    const col = new THREE.Color(groupColor(run[0].group))
    const pts = run.map((p) => toThree(p.x, p.y, p.z))
    aux.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col })))

    if (!opts.poly) continue
    for (const pl of PLANES) {
      const proj = run.map((q) => project(pl, q, off))
      st.planeItems[pl.id].add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(proj),
          new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.6 }),
        ),
      )
    }
  }

  // Довжини відрізків (лише у межах однієї прямої).
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a.group !== b.group) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    if (len <= 1e-9) continue
    const mid = toThree((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    mid.y += ext.ext * 0.02
    const l = makeTextSprite(`|${a.name}${b.name}|=${fmt(len, 2)}`, groupColor(a.group), labelScale * 0.8)
    l.position.copy(mid)
    aux.add(l)
  }

  for (const p of points) {
    const space = toThree(p.x, p.y, p.z)
    const isSel = selectedId === p.id

    // Точка в просторі: у вибраному стані — кільце навколо точки.
    const m0 = buildMarker(isSel ? 'ring' : opts.spaceMarker, isSel ? COLORS.select : groupColor(p.group), isSel ? mkSpace * 1.5 : mkSpace, null)
    m0.position.copy(space)
    tagPointId(m0, p.id)
    aux.add(m0)

    if (opts.labels) {
      const l0 = makeTextSprite(p.name, isSel ? COLORS.select : groupColor(p.group), labelScale)
      l0.position.copy(space).add(new THREE.Vector3(labelOff, labelOff * 0.7, labelOff))
      aux.add(l0)
    }

    // Слід на кожній площині — строго на своїй, з правильними координатами.
    for (const pl of PLANES) {
      const at = project(pl, p, off)
      const items = st.planeItems[pl.id]

      const m = buildMarker(opts.planeMarker, isSel ? COLORS.select : PLANE_CSS[pl.id], isSel ? mkPlane * 1.5 : mkPlane, pl)
      m.position.copy(at)
      tagPointId(m, p.id)
      items.add(m)

      if (opts.links) {
        const l = dashedLine(space, at, isSel ? COLORS.select : COLORS.gray, dash, gap)
        l.userData.pointId = p.id
        aux.add(l)
      }
      if (opts.labels) {
        const k = labelScale * 0.8
        const l = makeTextSprite(`${p.name}${pl.sub}`, PLANE_CSS[pl.id], k)
        l.position.copy(at).add(new THREE.Vector3(pl.labOff[0] * k, pl.labOff[1] * k, pl.labOff[2] * k))
        items.add(l)
      }
    }
  }
}

/** Навчальна анімація: «розгортка» проєкцій точки на площини. */
function startSweeps(st: SceneState, points: GeoPoint[], opts: ViewOpts): void {
  clearGroup(st.fxGroup)
  st.fxGroup.userData.sweeps = []
  if (points.length === 0) return

  const ext = sceneExtent(points)
  const off = ext.ext * 0.012 + opts.spread * ext.ext * 0.85
  const size = ext.ext * 0.03
  const sweeps: Sweep[] = []

  points.forEach((p, i) => {
    const space = toThree(p.x, p.y, p.z)
    PLANES.filter((pl) => opts[pl.id]).forEach((pl, j) => {
      const m = buildMarker(opts.planeMarker, PLANE_CSS[pl.id], size, pl)
      m.position.copy(space)
      st.fxGroup.add(m)
      sweeps.push({ mesh: m, from: space.clone(), to: project(pl, p, off), delay: i * 0.3 + j * 0.12, period: 1.5 })
    })
  })
  st.fxGroup.userData.sweeps = sweeps
}

function stopSweeps(st: SceneState): void {
  clearGroup(st.fxGroup)
  st.fxGroup.userData.sweeps = []
}

/* ── Ініціалізація рендерера ──────────────────────────────────────── */

function initScene(container: HTMLDivElement, props: { onSelect: (id: string | null) => void }, stRef: { current: SceneState | null }): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(COLORS.bg)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  camera.position.set(9, 7, 11)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0.3, 0)
  controls.minDistance = 1.5
  controls.maxDistance = 80

  const dataGroup = new THREE.Group()
  scene.add(dataGroup)
  const fxGroup = new THREE.Group()
  scene.add(fxGroup)

  const planeVisuals: Record<PlaneId, THREE.Group> = { p1: new THREE.Group(), p2: new THREE.Group(), p3: new THREE.Group() }
  const planeItems: Record<PlaneId, THREE.Group> = { p1: new THREE.Group(), p2: new THREE.Group(), p3: new THREE.Group() }
  for (const pl of PLANES) scene.add(planeVisuals[pl.id], planeItems[pl.id])

  const fit = () => {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  const st: SceneState = {
    renderer,
    scene,
    camera,
    controls,
    dataGroup,
    fxGroup,
    clock: new THREE.Clock(),
    resizeObs: new ResizeObserver(() => fit()),
    raf: 0,
    planeVisuals,
    planeItems,
    ext: 3,
    tween: null,
  }
  st.resizeObs.observe(container)
  fit()

  // Вибір об'єктом кліком (з умовою, що це не було перетягування).
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let downPos: { x: number; y: number } | null = null
  const aim = (e: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    raycaster.params.Line.threshold = Math.max(0.05, st.ext * 0.02)
  }
  const onDown = (e: PointerEvent) => {
    downPos = { x: e.clientX, y: e.clientY }
  }
  const onClick = (e: MouseEvent) => {
    if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return
    aim(e)
    const hit = raycaster.intersectObjects(scene.children, true).find((h) => h.object.userData?.pointId)
    props.onSelect(hit ? (hit.object.userData.pointId as string) : null)
  }
  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('click', onClick)

  const animate = () => {
    st.raf = requestAnimationFrame(animate)
    controls.update()

    const t = st.clock.getElapsedTime()
    if (st.tween) {
      const u = Math.min(1, (t - st.tween.t0) / st.tween.dur)
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2
      camera.position.lerpVectors(st.tween.from, st.tween.to, e)
      if (u >= 1) st.tween = null
    }

    const sweeps = fxGroup.userData.sweeps as Sweep[] | undefined
    for (const s of sweeps ?? []) {
      const u = ((t - s.delay) / s.period) % 1
      if (u < 0) continue
      s.mesh.position.lerpVectors(s.from, s.to, u)
      s.mesh.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.material) return
        const mat = m.material as THREE.MeshBasicMaterial
        mat.transparent = true
        mat.opacity = u > 0.9 ? Math.max(0, (1 - u) * 10) : 1
      })
    }

    renderer.render(scene, camera)
  }
  animate()

  stRef.current = st

  return () => {
    cancelAnimationFrame(st.raf)
    st.resizeObs.disconnect()
    controls.dispose()
    renderer.domElement.removeEventListener('pointerdown', onDown)
    renderer.domElement.removeEventListener('click', onClick)
    clearGroup(dataGroup)
    clearGroup(fxGroup)
    for (const pl of PLANES) {
      clearGroup(planeVisuals[pl.id])
      clearGroup(planeItems[pl.id])
      scene.remove(planeVisuals[pl.id], planeItems[pl.id])
    }
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      if (mesh.material) {
        const m = mesh.material as THREE.Material
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose())
        else {
          if (m instanceof THREE.SpriteMaterial) m.map?.dispose()
          m.dispose()
        }
      }
    })
    renderer.dispose()
    renderer.domElement.remove()
    stRef.current = null
  }
}

type CamView = 'iso' | 'top' | 'front' | 'side'

/* ── Компонент ────────────────────────────────────────────────────── */

export function Viewport3D({ points, selectedId = null, onSelect, animate = false }: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stRef = useRef<SceneState | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const [opts, setOpts] = useState<ViewOpts>(DEFAULT_OPTS)

  const sel = useMemo(() => points.find((p) => p.id === selectedId) ?? null, [points, selectedId])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    return initScene(container, { onSelect: (id) => onSelectRef.current?.(id) }, stRef)
  }, [])

  useEffect(() => {
    const st = stRef.current
    if (!st) return
    rebuildData(st, points, selectedId, opts)
  }, [points, selectedId, opts])

  useEffect(() => {
    const st = stRef.current
    if (!st) return
    if (animate) startSweeps(st, points, opts)
    else stopSweeps(st)
  }, [animate, points, opts])

  const patch = (p: Partial<ViewOpts>) => setOpts((o) => ({ ...o, ...p }))

  const flyTo = (view: CamView) => {
    const st = stRef.current
    if (!st) return
    const d = st.ext * 1.5
    const to: Record<CamView, THREE.Vector3> = {
      iso: new THREE.Vector3(d * 0.62, d * 0.48, d * 0.75),
      // Π₁ — горизонтальна: дивимося вниз уздовж нормалі (0, 1, 0)
      top: new THREE.Vector3(d * 0.04, d, d * 0.04),
      // Π₂ — фронтальна: уздовж нормалі (1, 0, 0)
      front: new THREE.Vector3(d, d * 0.04, 0),
      // Π₃ — профільна: уздовж нормалі (0, 0, 1)
      side: new THREE.Vector3(0, d * 0.04, d),
    }
    st.tween = { from: st.camera.position.clone(), to: to[view], t0: st.clock.getElapsedTime(), dur: 0.7 }
  }

  return (
    <div
      className="relative h-full w-full select-none"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      ref={containerRef}
    >
      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-slate-500">
          Додайте точки для побудови просторової сцени
        </div>
      )}

      {/* Панель вигляду */}
      <div className="absolute left-2 top-2 z-10 flex max-w-[min(96%,460px)] flex-col gap-1 rounded border border-slate-300 bg-white/85 px-2 py-1.5 font-mono text-[10px] text-slate-600 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Toggle label="Π₁" on={opts.p1} set={(v) => patch({ p1: v })} />
          <Toggle label="Π₂" on={opts.p2} set={(v) => patch({ p2: v })} />
          <Toggle label="Π₃" on={opts.p3} set={(v) => patch({ p3: v })} />
          <Toggle label="зв'язок" on={opts.links} set={(v) => patch({ links: v })} />
          <Toggle label="полілінії" on={opts.poly} set={(v) => patch({ poly: v })} />
          <Toggle label="підписи" on={opts.labels} set={(v) => patch({ labels: v })} />
          <Toggle label="засічки" on={opts.ticks} set={(v) => patch({ ticks: v })} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 pt-1">
          <Select label="у просторі" value={opts.spaceMarker} options={SPACE_SHAPES} onChange={(v) => patch({ spaceMarker: v })} />
          <Select label="на площинах" value={opts.planeMarker} options={PLANE_SHAPES} onChange={(v) => patch({ planeMarker: v })} />
          <label className="flex items-center gap-1">
            розмір
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={opts.size}
              onChange={(e) => patch({ size: Number(e.target.value) })}
              className="w-16 accent-sky-600"
            />
          </label>
          <label className="flex items-center gap-1">
            розвід
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opts.spread}
              onChange={(e) => patch({ spread: Number(e.target.value) })}
              className="w-16 accent-sky-600"
            />
          </label>
        </div>
      </div>

      {/* Стандартні види */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
        <button className="btn h-7 !px-2" onClick={() => flyTo('iso')} title="Аксонометричний вигляд">
          ◇
        </button>
        <button className="btn h-7 !px-2" onClick={() => flyTo('top')} title="Згори · нормаль Π₁ (горизонтальна, Z = const)">
          ↓
        </button>
        <button className="btn h-7 !px-2" onClick={() => flyTo('front')} title="Збоку · нормаль Π₂ (фронтальна, Y = const)">
          ▣
        </button>
        <button className="btn h-7 !px-2" onClick={() => flyTo('side')} title="Спереду · нормаль Π₃ (профільна, X = const)">
          ◧
        </button>
      </div>

      {/* Відомості про вибрану точку */}
      {sel && (
        <div className="absolute right-2 top-32 z-10 rounded border border-amber-300 bg-white/90 px-2 py-1.5 font-mono text-[10px] shadow-sm backdrop-blur">
          <div className="font-bold text-amber-600">
            {sel.name}
            <span className="ml-1 font-normal text-slate-500">
              X={fmt(sel.x, 2)} Y={fmt(sel.y, 2)} Z={fmt(sel.z, 2)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-col gap-0.5 text-slate-600">
            <span style={{ color: PLANE_CSS.p1 }}>
              Π₁ ({fmt(sel.x, 2)}; {fmt(sel.y, 2)})
            </span>
            <span style={{ color: PLANE_CSS.p2 }}>
              Π₂ ({fmt(sel.x, 2)}; {fmt(sel.z, 2)})
            </span>
            <span style={{ color: PLANE_CSS.p3 }}>
              Π₃ ({fmt(sel.y, 2)}; {fmt(sel.z, 2)})
            </span>
          </div>
        </div>
      )}

      {/* Легенда */}
      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded border border-slate-300 bg-white/80 px-2 py-1 font-mono text-[10px] text-slate-500 backdrop-blur">
        {PLANES.map((pl) => (
          <span key={pl.id} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: PLANE_CSS[pl.id] }} />
            {pl.id.toUpperCase()}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block h-0 w-5 border-t border-dashed border-[#94a3b8]" />
          зв'язок
        </span>
        <span className="whitespace-nowrap text-slate-400">тягніть — обертання · колесо — масштаб · клік — вибір точки</span>
      </div>
    </div>
  )
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="h-3 w-3 accent-sky-600" />
      {label}
    </label>
  )
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: ShapeKind
  options: Array<{ id: ShapeKind; label: string }>
  onChange: (v: ShapeKind) => void
}) {
  return (
    <label className="flex items-center gap-1">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ShapeKind)}
        className="rounded border border-slate-300 bg-white px-1 py-0.5 font-mono text-[10px] text-slate-700 outline-none focus:border-sky-500"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
