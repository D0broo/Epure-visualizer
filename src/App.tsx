import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GeoPoint } from './types'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { analyzePoints } from './math/epure'
import { presetById } from './presets'
import { DataInput, Analytics } from './components/DataInput'
import { EpureSvg } from './components/EpureSvg'
import { Viewport3D } from './components/Viewport3D'

type TabId = 'epure' | '3d'

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'epure', label: '2D · Епюр Монжа', icon: '◫' },
  { id: '3d', label: '3D · Просторова сцена', icon: '◇' },
]

const LS_KEY = 'epure.points.v1'
const MAX_HISTORY = 60

const SIDE_MIN = 260
const SIDE_MAX = 820
const SIDE_DEFAULT = 430
const SIDE_LS_KEY = 'epure.sideWidth.v1'

const withIds = (list: Array<{ name: string; x: number; y: number; z: number; group?: number }>): GeoPoint[] =>
  list.map((p, i) => ({ group: 0, ...p, id: `p-${i}` }))

const stripIds = (list: GeoPoint[]) => list.map(({ name, x, y, z, group }) => ({ name, x, y, z, group }))

function b64Encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64Decode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  return decodeURIComponent(escape(atob(pad)))
}

function loadInitial(): GeoPoint[] {
  try {
    const hash = window.location.hash.slice(1)
    if (hash) {
      const parsed = JSON.parse(b64Decode(hash))
      if (Array.isArray(parsed?.pts)) return withIds(parsed.pts)
    }
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) return withIds(parsed)
    }
  } catch {
    /* ignore, fallback */
  }
  return presetById('polyline6')!.points.map((p, i) => ({ ...p, id: `p-${i}` }))
}

/** Історія для undo/redo. */
function useHistory(initial: GeoPoint[]) {
  const [state, setState] = useState<{ past: GeoPoint[][]; present: GeoPoint[]; future: GeoPoint[][] }>({
    past: [],
    present: initial,
    future: [],
  })

  const set = useCallback((updater: GeoPoint[] | ((cur: GeoPoint[]) => GeoPoint[])) => {
    setState((s) => {
      const cur = s.present
      const n = typeof updater === 'function' ? updater(cur) : updater
      if (JSON.stringify(cur) === JSON.stringify(n)) return s
      return { past: [...s.past, cur].slice(-MAX_HISTORY), present: n, future: [] }
    })
  }, [])

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0) return s
      const prev = s.past[s.past.length - 1]
      return { past: s.past.slice(0, -1), present: prev, future: [s.present, ...s.future].slice(0, MAX_HISTORY) }
    })
  }, [])

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0) return s
      const next = s.future[0]
      return { past: [...s.past, s.present].slice(-MAX_HISTORY), present: next, future: s.future.slice(1) }
    })
  }, [])

  return { points: state.present, set, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 }
}

export default function App() {
  const hist = useHistory(loadInitial())
  const { points, set: setPoints, undo, redo, canUndo, canRedo } = hist
  const [tab, setTab] = useState<TabId>('epure')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [animate, setAnimate] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [sideOpen, setSideOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null)
  const [sideW, setSideW] = useState<number>(() => {
    const n = Number(localStorage.getItem(SIDE_LS_KEY))
    return Number.isFinite(n) && n >= SIDE_MIN && n <= SIDE_MAX ? n : SIDE_DEFAULT
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDE_LS_KEY, String(sideW))
    } catch {
      /* ignore */
    }
  }, [sideW])

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    resizeRef.current = { startX: e.clientX, startW: sideW }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const moveResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current
    if (!r) return
    setSideW(Math.min(SIDE_MAX, Math.max(SIDE_MIN, r.startW + (e.clientX - r.startX))))
  }
  const endResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    resizeRef.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const report = useMemo(() => analyzePoints(points), [points])

  // Спільний вміст бокової панелі (десктоп + мобільна завіса).
  const renderSide = (
    headerExtra?: ReactNode,
  ) => (
    <>
      <div className="flex items-center justify-between border-b border-slate-300 bg-ink px-4 py-3 text-white">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-widest">Епюр Монжа</h1>
          <p className="text-[11px] text-white/60">Комплексне креслення · нарисна геометрія</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded bg-white/10 px-2 py-1 font-mono text-[10px] text-white/70 min-[420px]:inline">Π₁ / Π₂ / Π₃</span>
          {headerExtra}
        </div>
      </div>

      {/* Інструменти */}
      <div className="relative flex flex-wrap items-center gap-1 border-b border-slate-300 bg-white px-2 py-1.5">
        <button className="btn" onClick={undo} disabled={!canUndo} title="Скасувати (Ctrl+Z)">
          ↩
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo} title="Повторити (Ctrl+Y)">
          ↪
        </button>
        <span className="mx-0.5 h-4 w-px bg-slate-300" />
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importCsv(f)
            e.target.value = ''
          }}
        />
        <button className="btn" onClick={() => fileRef.current?.click()} title="Імпорт CSV">
          ⬅ CSV
        </button>
        <button className="btn" onClick={exportCsv} title="Експорт CSV">
          CSV ➔
        </button>
        <button className="btn" onClick={shareLink} title="Скопіювати посилання з даними">
          🔗
        </button>
        <button
          className="btn"
          onClick={() => setPoints(withIds(presetById('polyline6')!.points))}
          title="Завантажити стандартний пресет"
        >
          ⟲ пресет
        </button>
        <span className="ml-auto px-1 text-[10px] text-slate-400">
          {points.length} точок · <span className="font-mono">∑|AB|={report.totalLength === null ? '—' : report.totalLength.toFixed(3)}</span>
        </span>
        {flash && (
          <span className="absolute right-2 top-10 z-20 rounded border border-slate-300 bg-white px-2 py-1 text-[10px] text-sky-700 shadow">
            {flash}
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <DataInput
          points={points}
          onChange={setPoints}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <Analytics report={report} />
      </div>
    </>
  )

  // Авто-збереження в localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(stripIds(points)))
    } catch {
      /* ignore */
    }
  }, [points])

  // Гарячі клавіші.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const exportCsv = useCallback(() => {
    const rows = [['name', 'x', 'y', 'z', 'group'], ...points.map((p) => [p.name, String(p.x), String(p.y), String(p.z), String(p.group)])]
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'epure.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [points])

  const importCsv = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        const lines = text.split(/\r?\n/).filter((l) => l.trim())
        const data = lines.slice(lines.length > 1 && /name/i.test(lines[0]) ? 1 : 0)
        const pts: Array<{ name: string; x: number; y: number; z: number; group?: number }> = []
        for (const line of data) {
          const parts = line.split(',').map((v) => v.trim())
          const [name, x, y, z, group] = parts
          const nums = [x, y, z].map((v) => parseFloat(v.replace(',', '.')))
          if (nums.every((n) => Number.isFinite(n))) {
            const g = group === undefined || group === '' ? undefined : parseFloat(group.replace(',', '.'))
            pts.push({ name: name || `P${pts.length + 1}`, x: nums[0], y: nums[1], z: nums[2], group: Number.isFinite(g as number) ? (g as number) : undefined })
          }
        }
        if (pts.length > 0) setPoints(withIds(pts))
      }
      reader.readAsText(file)
    },
    [setPoints],
  )

  const shareLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}#${b64Encode(JSON.stringify({ v: 1, pts: stripIds(points) }))}`
    navigator.clipboard?.writeText(url).then(
      () => setFlash('Посилання скопійовано'),
      () => setFlash('Копіювання недоступне'),
    )
  }, [points])

  const [flash, setFlash] = useState<string | null>(null)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1800)
    return () => clearTimeout(t)
  }, [flash])

  return (
    <div className="relative flex h-screen flex-col overflow-hidden font-sans lg:flex-row">
      {/* Ліва панель · десктоп */}
      {sideOpen && (
        <aside
          className="hidden min-h-0 shrink-0 flex-col bg-slate-50 lg:flex lg:h-full lg:border-r lg:border-slate-300"
          style={{ width: sideW, transition: dragging ? 'none' : 'width 150ms ease-out', overflow: 'hidden' }}
        >
          {renderSide(
            <button
              className="rounded bg-white/10 px-2 py-1 text-xs text-white/70 transition hover:bg-white/20 hover:text-white"
              onClick={() => setSideOpen(false)}
              title="Згорнути панель"
            >
              «
            </button>,
          )}
        </aside>
      )}

      {/* Роздільник для зміни розміру (десктоп) */}
      {sideOpen && (
        <div
          className="hidden w-1.5 shrink-0 cursor-col-resize touch-none select-none bg-slate-300 transition-colors hover:bg-sky-400 active:bg-sky-500 lg:block"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onDoubleClick={() => setSideW(SIDE_DEFAULT)}
          title="Тягніть, щоб змінити ширину панелі · подвійний клік — скинути"
        />
      )}

      {/* Кнопка розгортання, коли панель згорнута (десктоп) */}
      {!sideOpen && (
        <button
          className="absolute left-3 top-3 z-30 hidden items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow transition hover:border-sky-400 hover:text-sky-700 lg:inline-flex"
          onClick={() => setSideOpen(true)}
          title="Показати панель даних"
        >
          ☰ Панель
        </button>
      )}

      {/* Права частина */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-300 bg-white px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-xs font-semibold transition ${
                tab === t.id ? 'bg-ink text-white shadow' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <span aria-hidden>{t.icon}</span>
              {t.label}
            </button>
          ))}
          {tab === '3d' && (
            <button
              onClick={() => setAnimate((a) => !a)}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-xs font-semibold transition ${
                animate ? 'bg-amber-500 text-white shadow' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {animate ? '⏸ зупинити' : '▶ проєкції'}
            </button>
          )}
          {selectedId && (
            <button className="ml-auto rounded bg-amber-100 px-2 py-1 font-mono text-[11px] text-amber-800" onClick={() => setSelectedId(null)}>
              вибір: {points.find((p) => p.id === selectedId)?.name} ✕
            </button>
          )}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {tab === 'epure' ? (
            <EpureSvg points={points} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <Viewport3D points={points} selectedId={selectedId} onSelect={setSelectedId} animate={animate} />
          )}
        </div>
      </main>

      {/* Кнопка відкриття панелі даних (мобільний) */}
      <button
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-xl transition active:scale-95 lg:hidden"
        onClick={() => setMobileOpen(true)}
        title="Відкрити панель даних"
      >
        ☰ Дані
      </button>

      {/* Мобільна завіса з введенням даних */}
      {mobileOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="relative flex max-h-[88vh] flex-col overflow-hidden rounded-t-2xl bg-slate-50 shadow-2xl"
            style={{ animation: 'drawer-up 180ms ease-out' }}
          >
            {renderSide(
              <button
                className="rounded bg-white/10 px-2 py-1 text-xs text-white/70 transition hover:bg-white/20 hover:text-white"
                onClick={() => setMobileOpen(false)}
                title="Закрити панель"
              >
                ✕
              </button>,
            )}
          </div>
        </div>
      )}
    </div>
  )
}