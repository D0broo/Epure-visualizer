import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GeoPoint } from '../types'
import { fmt } from '../math/epure'
import { groupColor } from '../palette'

const COLORS = {
  bg: '#eef1f4',
  ink: '#1c2733',
  wire: '#2563eb',
  gray: '#94a3b8',
  p1: '#d97706',
  p2: '#0284c7',
  p3: '#b45309',
  select: '#f59e0b',
  axisX: '#e11d48',
  axisY: '#16a34a',
  axisZ: '#2563eb',
  planeP1: 0x22c55e,
  planeP2: 0x3b82f6,
  planeP3: 0xf59e0b,
}

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
}

interface Sweep {
  mesh: THREE.Mesh
  from: THREE.Vector3
  to: THREE.Vector3
  delay: number
  period: number
}

const toThree = (x: number, y: number, z: number) => new THREE.Vector3(x, z, y)

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
  return sprite
}

function buildAxes(group: THREE.Group, ext: number): void {
  const len = ext * 1.2
  const mkLine = (axis: 'x' | 'y' | 'z', color: string) => {
    const pts: THREE.Vector3[] = []
    if (axis === 'x') pts.push(new THREE.Vector3(-len, 0, 0), new THREE.Vector3(len, 0, 0))
    else if (axis === 'y') pts.push(new THREE.Vector3(0, 0, -len), new THREE.Vector3(0, 0, len))
    else pts.push(new THREE.Vector3(0, -len, 0), new THREE.Vector3(0, len, 0))
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }))
  }

  const labels = new THREE.Group()
  // Після транспозиції X↔Y: вісь уздовж three.x показує Y, уздовж three.z — X.
  const spriteY = makeTextSprite('y', COLORS.axisY, ext * 0.28)
  const spriteX = makeTextSprite('x', COLORS.axisX, ext * 0.28)
  const spriteZ = makeTextSprite('z', COLORS.axisZ, ext * 0.28)
  spriteY.position.set(len * 1.16, 0, 0)
  spriteX.position.set(0, 0, len * 1.16)
  spriteZ.position.set(0, len * 1.16, 0)
  labels.add(spriteY, spriteX, spriteZ)

  group.add(mkLine('x', COLORS.axisY), mkLine('y', COLORS.axisX), mkLine('z', COLORS.axisZ), labels)
}

/** Напівпрозорі площини проєкцій та сітки. */
function buildPlanes(group: THREE.Group, ext: number): void {
  const size = ext * 1.18
  const border = (color: number): THREE.LineSegments => {
    const half = size / 2
    const pts = [
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
      new THREE.Vector3(-half, -half, 0),
    ]
    return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }))
  }
  const makePlane = (color: number, rotation: [number, number, number]) => {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat)
    mesh.rotation.set(...rotation)
    return mesh
  }

  const p1 = makePlane(COLORS.planeP1, [-Math.PI / 2, 0, 0])
  const p1b = border(COLORS.planeP1)
  p1b.rotation.set(-Math.PI / 2, 0, 0)
  const p2 = makePlane(COLORS.planeP2, [0, 0, 0])
  const p2b = border(COLORS.planeP2)
  const p3 = makePlane(COLORS.planeP3, [0, Math.PI / 2, 0])
  const p3b = border(COLORS.planeP3)
  p3b.rotation.set(0, Math.PI / 2, 0)

  const mkGrid = (plane: 'p1' | 'p2' | 'p3', color: number) => {
    const pts: THREE.Vector3[] = []
    const step = ext / 4
    const half = size / 2
    for (let k = -4; k <= 4; k++) {
      const v = Math.round(k * step * 10) / 10
      if (plane === 'p1') {
        pts.push(new THREE.Vector3(v, 0, -half), new THREE.Vector3(v, 0, half))
        pts.push(new THREE.Vector3(-half, 0, v), new THREE.Vector3(half, 0, v))
      } else if (plane === 'p2') {
        pts.push(new THREE.Vector3(v, -half, 0), new THREE.Vector3(v, half, 0))
        pts.push(new THREE.Vector3(-half, v, 0), new THREE.Vector3(half, v, 0))
      } else {
        pts.push(new THREE.Vector3(0, -half, v), new THREE.Vector3(0, half, v))
        pts.push(new THREE.Vector3(0, v, -half), new THREE.Vector3(0, v, half))
      }
    }
    return new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.18 }))
  }

  group.add(p1, p1b, p2, p2b, p3, p3b, mkGrid('p1', COLORS.planeP1), mkGrid('p2', COLORS.planeP2), mkGrid('p3', COLORS.planeP3))
}

function labelAt(text: string, color: string, pos: THREE.Vector3, scale: number): THREE.Sprite {
  const s = makeTextSprite(text, color, scale)
  s.position.copy(pos)
  return s
}

function dashedLine(a: THREE.Vector3, b: THREE.Vector3, color: string): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b])
  const mat = new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.85 })
  const line = new THREE.Line(geo, mat)
  line.computeLineDistances()
  return line
}

function sphere(color: THREE.ColorRepresentation, r: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), new THREE.MeshBasicMaterial({ color }))
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

function rebuildData(st: SceneState, points: GeoPoint[], selectedId: string | null): void {
  const { dataGroup } = st
  clearGroup(dataGroup)

  if (points.length === 0) return

  const maxAbs = Math.max(...points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)]), 1)
  const ext = Math.max(maxAbs * 1.15, 3)
  const eps = ext * 0.004
  const labelScale = ext * 0.13
  const off = ext * 0.14

  const axes = new THREE.Group()
  buildAxes(axes, ext)
  dataGroup.add(axes)

  const planes = new THREE.Group()
  buildPlanes(planes, ext)
  dataGroup.add(planes)

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
    dataGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col })))

    const projOnP1 = pts.map((v) => new THREE.Vector3(v.x, eps, v.z))
    const projOnP2 = pts.map((v) => new THREE.Vector3(v.x, v.y, eps))
    const g1 = new THREE.BufferGeometry().setFromPoints(projOnP1)
    const g2 = new THREE.BufferGeometry().setFromPoints(projOnP2)
    dataGroup.add(new THREE.Line(g1, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 })))
    dataGroup.add(new THREE.Line(g2, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 })))
  }

  // Довжини відрізків (лише у межах однієї прямої).
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if (a.group !== b.group) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    if (len <= 1e-9) continue
    const mid = toThree((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    mid.add(new THREE.Vector3(0, 0, eps * 6))
    dataGroup.add(labelAt(`|${a.name}${b.name}|=${fmt(len, 2)}`, groupColor(a.group), mid, labelScale * 0.9))
  }

  points.forEach((p) => {
    const space = toThree(p.x, p.y, p.z)
    const onP1 = toThree(p.x, 0, p.z)
    const onP2 = toThree(p.x, p.y, 0)
    const onP3 = toThree(0, p.y, p.z)
    const isSel = selectedId === p.id

    const linkColor = isSel ? COLORS.select : COLORS.gray
    const l1 = dashedLine(space, onP1, linkColor)
    const l2 = dashedLine(space, onP2, linkColor)
    const l3 = dashedLine(space, onP3, linkColor)

    const m1 = sphere(COLORS.p1, 0.07)
    m1.position.set(onP1.x, eps, onP1.z)
    const m2 = sphere(COLORS.p2, 0.07)
    m2.position.set(onP2.x, onP2.y, eps)
    const m3 = sphere(COLORS.p3, 0.07)
    m3.position.set(-eps, onP3.y, onP3.z)
    const m0 = sphere(isSel ? COLORS.select : groupColor(p.group), isSel ? 0.17 : 0.11)
    m0.position.copy(space)

    const l0 = labelAt(p.name, isSel ? COLORS.select : groupColor(p.group), space.clone().add(new THREE.Vector3(0, off, off)), labelScale)
    const lP1 = labelAt(`${p.name}₁`, COLORS.p1, new THREE.Vector3(onP1.x, eps, onP1.z).add(new THREE.Vector3(off, 0, 0)), labelScale)
    const lP2 = labelAt(`${p.name}₂`, COLORS.p2, new THREE.Vector3(onP2.x, onP2.y, eps).add(new THREE.Vector3(off, 0, 0)), labelScale)
    const lP3 = labelAt(`${p.name}₃`, COLORS.p3, new THREE.Vector3(-eps, onP3.y, onP3.z).add(new THREE.Vector3(0, 0, off)), labelScale)

    for (const o of [m0, m1, m2, m3, l0, lP1, lP2, lP3, l1, l2, l3]) {
      o.userData.pointId = p.id
    }

    dataGroup.add(m0, m1, m2, m3, l0, lP1, lP2, lP3, l1, l2, l3)
  })
}

/** Навчальна анімація: "розгортка" проєкцій точки на площини. */
function startSweeps(st: SceneState, points: GeoPoint[]): void {
  clearGroup(st.fxGroup)
  st.fxGroup.userData.sweeps = []
  if (points.length === 0) return

  const maxAbs = Math.max(...points.flatMap((p) => [Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)]), 1)
  const ext = Math.max(maxAbs * 1.15, 3)
  const eps = ext * 0.02

  points.forEach((p, i) => {
    const space = toThree(p.x, p.y, p.z)
    const targets = [
      { to: toThree(p.x, 0, p.z).setY(eps), color: new THREE.Color(COLORS.p1) },
      { to: toThree(p.x, p.y, 0).setZ(eps), color: new THREE.Color(COLORS.p2) },
      { to: toThree(0, p.y, p.z).setX(-eps), color: new THREE.Color(COLORS.p3) },
    ]
    targets.forEach((t, j) => {
      const m = sphere(t.color, ext * 0.035)
      m.position.copy(space)
      st.fxGroup.add(m)
      st.fxGroup.userData.sweeps = [
        ...(st.fxGroup.userData.sweeps ?? []),
        { mesh: m, from: space.clone(), to: t.to, delay: i * 0.35 + j * 0.12, period: 1.6 },
      ]
    })
  })
}

function stopSweeps(st: SceneState): void {
  clearGroup(st.fxGroup)
  st.fxGroup.userData.sweeps = []
}

function initScene(container: HTMLDivElement, props: { onSelect: (id: string | null) => void }, stRef: { current: SceneState | null }): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(COLORS.bg)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1))
  const dir = new THREE.DirectionalLight(0xffffff, 1.4)
  dir.position.set(6, 10, 8)
  scene.add(dir)

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  camera.position.set(9, 7, 11)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(0, 0.4, 0)
  controls.minDistance = 1.5
  controls.maxDistance = 60

  const dataGroup = new THREE.Group()
  scene.add(dataGroup)
  const fxGroup = new THREE.Group()
  scene.add(fxGroup)
  const clock = new THREE.Clock()

  const st: SceneState = { renderer, scene, camera, controls, dataGroup, fxGroup, clock, resizeObs: new ResizeObserver(() => fit()) }
  const fit = () => {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  st.resizeObs.observe(container)
  fit()

  // Вибір об'єктом кліком (з невеликою умовою на перетягування).
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let downPos: { x: number; y: number } | null = null
  const onDown = (e: PointerEvent) => {
    downPos = { x: e.clientX, y: e.clientY }
  }
  const onClick = (e: MouseEvent) => {
    if (!downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return
    const rect = renderer.domElement.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObjects(dataGroup.children, true)
    const hit = hits.find((h) => h.object.userData?.pointId)
    props.onSelect(hit ? (hit.object.userData.pointId as string) : null)
  }
  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('click', onClick)

  const animate = () => {
    requestAnimationFrame(animate)
    controls.update()

    const t = clock.getElapsedTime()
    const sweeps = (fxGroup.userData.sweeps ?? []) as Sweep[]
    for (const s of sweeps) {
      const u = ((t - s.delay) / s.period) % 1
      if (u < 0) continue
      s.mesh.position.lerpVectors(s.from, s.to, u)
      const mat = s.mesh.material as THREE.MeshBasicMaterial
      mat.opacity = u > 0.92 ? (1 - u) * 12.5 : 1
      mat.transparent = true
    }

    renderer.render(scene, camera)
  }
  animate()

  stRef.current = st

  return () => {
    st.resizeObs.disconnect()
    controls.dispose()
    renderer.setAnimationLoop(null)
    renderer.domElement.removeEventListener('pointerdown', onDown)
    renderer.domElement.removeEventListener('click', onClick)
    clearGroup(dataGroup)
    clearGroup(fxGroup)
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

export function Viewport3D({ points, selectedId = null, onSelect, animate = false }: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stRef = useRef<SceneState | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Транспозиція X↔Y: осі узгоджені з 2D епюром (у 3D X іде вглиб, Y — праворуч).
  const geo = useMemo(() => points.map((p) => ({ ...p, x: p.y, y: p.x })), [points])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    return initScene(container, { onSelect: (id) => onSelectRef.current?.(id) }, stRef)
  }, [])

  useEffect(() => {
    const st = stRef.current
    if (!st) return
    rebuildData(st, geo, selectedId)
  }, [geo, selectedId])

  useEffect(() => {
    const st = stRef.current
    if (!st) return
    if (animate) startSweeps(st, geo)
    else stopSweeps(st)
  }, [animate, geo])

  return (
    <div
      className="relative h-full w-full select-none"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      ref={containerRef}
    >
      <div className="pointer-events-none absolute left-2 top-2 select-none rounded bg-white/70 px-2 py-1 font-mono text-[11px] text-slate-600 shadow-sm">
        Тягніть — обертання · колесо — масштаб · клік — вибір точки (Π₁ зел., Π₂ син., Π₃ жовт.)
      </div>
    </div>
  )
}