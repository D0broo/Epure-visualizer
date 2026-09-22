import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AnalysisReport as Report, GeoPoint, PresetId, SegmentAnalysis, SegmentPosition } from '../types'
import { fmt } from '../math/epure'
import { groupColor, groupLabel } from '../palette'
import { nextPointName, presets } from '../presets'
import { generateLine, LINE_TYPES } from '../generator'
import { RtTriangle, RtModal } from './RtConstruction'

interface DataInputProps {
  points: GeoPoint[]
  onChange: (points: GeoPoint[]) => void
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}

function CoordCell({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = () => {
    const norm = text.trim().replace(',', '.')
    const n = parseFloat(norm)
    onCommit(Number.isFinite(n) ? n : value)
  }

  return (
    <input
      className="num-input"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      inputMode="decimal"
      aria-label="координата"
    />
  )
}

export function DataInput({ points, onChange, selectedId = null, onSelect }: DataInputProps) {
  const [presetId, setPresetId] = useState<PresetId>('polyline6')
  const [lineType, setLineType] = useState<SegmentPosition>('лог')

  const update = (id: string, field: 'name' | 'x' | 'y' | 'z' | 'group', value: string | number) =>
    onChange(points.map((p) => (p.id === id ? { ...p, [field]: value } : p)))

  const removePoint = (id: string) => onChange(points.filter((p) => p.id !== id))

  const nextFreeGroup = useMemo(() => points.reduce((m, p) => Math.max(m, p.group), -1) + 1, [points])

  const addPoint = (group?: number) => {
    const name = nextPointName(points)
    const def = [1, 1, 1]
    if (points.length > 0) {
      const last = points[points.length - 1]
      def[0] = last.x + 1.5
      def[1] = last.y
      def[2] = last.z
    }
    onChange([
      ...points,
      {
        id: `p-${Date.now()}-${points.length}`,
        name,
        x: def[0],
        y: def[1],
        z: def[2],
        group: group ?? points[points.length - 1]?.group ?? 0,
      },
    ])
  }

  const applyPreset = (id: PresetId) => {
    setPresetId(id)
    const preset = presets.find((pr) => pr.id === id)
    if (preset) onChange(preset.points.map((p, i) => ({ ...p, id: `p-${i}` })))
  }

  return (
    <>
    <section className="panel">
      <div className="panel-title">
        <span>Точки простору (X, Y, Z)</span>
        <span className="font-mono text-[10px] normal-case text-slate-400">{points.length} шт.</span>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        <select
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-sky-500"
          value={presetId}
          onChange={(e) => applyPreset(e.target.value as PresetId)}
          aria-label="Пресет"
        >
          {presets.map((pr) => (
            <option key={pr.id} value={pr.id}>
              {pr.label}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => addPoint()} title="Додати точку до поточної прямої">
          + Точка
        </button>
        <button className="btn" onClick={() => addPoint(nextFreeGroup)} title="Почати нову пряму (новий колір)">
          + Пряма
        </button>
        <button className="btn" onClick={() => onChange([])} title="Очистити всі точки">
          Очистити
        </button>
      </div>

      {points.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-slate-400">
          Додайте точки або оберіть пресет вище.
        </p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-left">Ім'я</th>
                <th className="px-1 py-1.5 text-center">X</th>
                <th className="px-1 py-1.5 text-center">Y</th>
                <th className="px-1 py-1.5 text-center">Z</th>
                <th className="px-1 py-1.5 text-center">Пряма</th>
                <th className="px-2 py-1.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onSelect?.(selectedId === p.id ? null : p.id)}
                  className={`cursor-pointer border-t border-slate-100 transition hover:bg-sky-50/50 ${
                    selectedId === p.id ? 'bg-amber-50/70 ring-1 ring-inset ring-amber-300' : ''
                  }`}
                >
                  <td className="px-2 py-1">
                    <input
                      className="w-12 rounded border border-slate-300 bg-white px-1 py-0.5 font-mono text-xs font-bold text-ink outline-none focus:border-sky-500"
                      value={p.name}
                      onChange={(e) => update(p.id, 'name', e.target.value.slice(0, 2))}
                      aria-label="ім'я точки"
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <CoordCell value={p.x} onCommit={(n) => update(p.id, 'x', n)} />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <CoordCell value={p.y} onCommit={(n) => update(p.id, 'y', n)} />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <CoordCell value={p.z} onCommit={(n) => update(p.id, 'z', n)} />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white transition hover:ring-2 hover:ring-slate-300"
                      style={{ backgroundColor: groupColor(p.group) }}
                      onClick={() => update(p.id, 'group', ((p.group + 1) % 8))}
                      title={`Пряма ${p.group + 1} · клік — змінити колір`}
                    >
                      {p.group + 1}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button
                      className="rounded px-1 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                      onClick={() => removePoint(p.id)}
                      title="Видалити точку"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>

    <section className="panel">
      <div className="panel-title">
        <span>Генератор випадкової прямої</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <select
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-sky-500"
          value={lineType}
          onChange={(e) => setLineType(e.target.value as SegmentPosition)}
          aria-label="Тип прямої"
        >
          {LINE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          className="btn"
          onClick={() => {
            const group = points.reduce((m, p) => Math.max(m, p.group), -1) + 1
            onChange([...points, ...generateLine(lineType, points, group)])
          }}
          title="Додати нову пряму з випадковими координатами обраного типу"
        >
          🎲 Згенерувати
        </button>
      </div>
    </section>
    </>
  )
}

export function Analytics({ report }: { report: Report }) {
  const [zoomSeg, setZoomSeg] = useState<SegmentAnalysis | null>(null)

  // Групуємо відрізки за прямою (group), зберігаючи порядок появи.
  const byLine = useMemo(() => {
    const lines = new Map<number, SegmentAnalysis[]>()
    for (const seg of report.segments) {
      const g = seg.from.group
      const arr = lines.get(g)
      if (arr) arr.push(seg)
      else lines.set(g, [seg])
    }
    return [...lines.entries()].map(([group, segments]) => ({ group, segments, total: segments.reduce((s, x) => s + x.length, 0) }))
  }, [report.segments])

  return (
    <>
      <section className="panel">
        <div className="panel-title">
          <span>Аналітичний розрахунок</span>
        </div>

      <div className="space-y-3 px-3 py-2">
        {/* Загальна довжина */}
        <div className="flex items-baseline justify-between rounded bg-slate-50 px-3 py-2">
          <span className="text-xs text-slate-500">Загальна довжина всіх прямих (∑|AB|)</span>
          <span className="font-mono text-sm font-bold text-ink">
            {report.totalLength === null ? '—' : fmt(report.totalLength, 3)}
          </span>
        </div>

        {/* По прямій: довжина кожної */}
        {byLine.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {byLine.map(({ group, total }) => (
              <span key={group} className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: groupColor(group) }} />
                {groupLabel(group)} · <b className="text-slate-800">{fmt(total, 3)}</b>
              </span>
            ))}
          </div>
        )}

        {/* Відрізки по прямих */}
        {report.segments.length > 0 && (
          <div>
            {byLine.map(({ group, segments, total }) => (
              <div key={group} className="mt-2 first:mt-0">
                <div
                  className="mb-1 flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: `${groupColor(group)}1a`, color: groupColor(group) }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: groupColor(group) }} />
                  {groupLabel(group)} · {segments.length} відр. · ∑ = {fmt(total, 3)}
                </div>
                <table className="w-full text-[11px]">
                  <thead className="text-[10px] uppercase text-slate-400">
                    <tr>
                      <th className="text-left font-medium">Відр.</th>
                      <th className="text-right font-medium">|AB|</th>
                      <th className="text-right font-medium">П1</th>
                      <th className="text-right font-medium">П2</th>
                      <th className="text-right font-medium">П3</th>
                      <th className="text-right font-medium">α/β/γ°</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((seg, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-0.5 font-mono font-bold" style={{ color: groupColor(group) }}>{seg.label}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums">{fmt(seg.length, 3)}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums text-amber-600">
                          {fmt(seg.lengthP1, 3)}
                        </td>
                        <td className="py-0.5 text-right font-mono tabular-nums text-sky-600">
                          {fmt(seg.lengthP2, 3)}
                        </td>
                        <td className="py-0.5 text-right font-mono tabular-nums text-orange-700">
                          {fmt(seg.lengthP3, 3)}
                        </td>
                        <td className="py-0.5 text-right font-mono tabular-nums text-slate-500">
                          {fmt(seg.angleToP1, 0)}/{fmt(seg.angleToP2, 0)}/
                          <span className="hidden xl:inline">{fmt(seg.angleToP3, 0)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="mt-1 space-y-0.5">
                  {segments.map((seg, i) => (
                    <li key={i} className="text-[11px] text-slate-600">
                      <span className="font-mono font-bold" style={{ color: groupColor(group) }}>{seg.label} → </span>
                      {seg.positionLabel}
                    </li>
                  ))}
                </ul>

                {/* Метод прямокутного трикутника */}
                <div className="mt-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Натуральна довжина {groupLabel(group)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {segments.map((seg, i) => (
                    <button
                      key={i}
                      onClick={() => setZoomSeg(seg)}
                      className="group relative rounded border border-slate-200 bg-slate-50/70 px-2 py-1 text-center transition hover:border-sky-400 hover:bg-sky-50/60"
                      title="Натисніть, щоб збільшити креслення"
                    >
                      <div className="flex items-center justify-center gap-1 font-mono text-[10px] font-bold text-slate-600">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: groupColor(group) }} />
                        {seg.label}
                        <span className="text-[9px] text-slate-300 transition group-hover:text-sky-500">⤢</span>
                      </div>
                      <RtTriangle seg={seg} />
                      <div className="font-mono text-[10px] text-slate-500">|AB| = {fmt(seg.length, 3)}</div>
                    </button>
                  ))}
                </div>

                {/* Сліди прямих */}
                <div className="mt-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Сліди
                </div>
                {segments.map((seg, i) =>
                  seg.traces.length > 0 ? (
                    <div key={i} className="mb-1 text-[11px] leading-4 text-slate-600">
                      <span className="font-mono font-bold" style={{ color: groupColor(group) }}>{seg.label}:</span>{' '}
                      {seg.traces
                        .map((tr) => (
                          <span key={tr.label}>
                            {tr.label}
                            <span className="text-slate-400">
                              ({fmt(tr.x)}; {fmt(tr.y)}; {fmt(tr.z)}){tr.onSegment ? '' : ' · поза відр. '}
                            </span>
                          </span>
                        ))
                        .reduce<ReactNode[]>((acc, node, j) => (j === 0 ? [node] : [...acc, <span key={`s${j}`}>, </span>, node]), [])}
                    </div>
                  ) : (
                    <div key={i} className="mb-1 text-[11px] text-slate-500">
                      <span className="font-mono font-bold" style={{ color: groupColor(group) }}>{seg.label}:</span> паралельна площинам проєкцій
                    </div>
                  ),
                )}
              </div>
            ))}
          </div>
        )}

        {/* Точки на площинах та осях */}
        {(report.onPlanes.length > 0 || report.onAxes.length > 0) && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Точки в площинах та на осях
            </div>
            {report.onPlanes.map(({ point, memberships }, i) => (
              <div key={`pl-${i}`} className="text-[11px] text-slate-600">
                <span className="font-mono font-bold text-slate-800">{point.name}</span>{' '}
                <span className="text-slate-400">
                  ({fmt(point.x)}; {fmt(point.y)}; {fmt(point.z)})
                </span>{' '}
                → {memberships.map((m) => m.label).join(' і ')}
              </div>
            ))}
            {report.onAxes.map(({ point, memberships }, i) => (
              <div key={`ax-${i}`} className="text-[11px] text-slate-600">
                <span className="font-mono font-bold text-slate-800">{point.name}</span>{' '}
                <span className="text-slate-400">
                  ({fmt(point.x)}; {fmt(point.y)}; {fmt(point.z)})
                </span>{' '}
                → {memberships.map((m) => m.label).join(' і ')}
              </div>
            ))}
          </div>
        )}

        {/* Конкуруючі точки */}
        {report.competing.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Конкуруючі точки ({report.competing.length})
            </div>
            {report.competing.map((c, i) => (
              <div key={`cp-${i}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                <div className="text-[11px] font-semibold text-slate-700">
                  {c.a.name} & {c.b.name} · <span className="font-normal text-slate-500">{c.kind}</span>
                </div>
                <div className="text-[11px] text-slate-500">{c.description}</div>
              </div>
            ))}
          </div>
        )}

        {report.segments.length === 0 &&
          report.onPlanes.length === 0 &&
          report.competing.length === 0 && (
            <p className="text-[11px] text-slate-400">Немає даних для аналізу.</p>
          )}
      </div>
      </section>
      {zoomSeg && <RtModal seg={zoomSeg} onClose={() => setZoomSeg(null)} />}
    </>
  )
}