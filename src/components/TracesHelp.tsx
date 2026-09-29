import type { TraceCalc } from '../types'
import { fmt, TRACE_RULES } from '../math/epure'

/** Довідка «Як будуються сліди?» — параметричне рівняння, таблиця правил і крайові випадки. */
export function TracesHelp() {
  return (
    <div className="mb-2 space-y-1.5 rounded border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-[11px] leading-4 text-slate-600">
      <p>
        <b className="text-slate-700">Слід</b> — точка перетину прямої з площиною проєкції. Площин три, тож слідів максимум
        три: <span className="font-mono font-bold text-slate-700">M₁</span>, <span className="font-mono font-bold text-slate-700">N₂</span>,{' '}
        <span className="font-mono font-bold text-slate-700">K₃</span>. Це справжні точки простору, які просто лежать на
        відповідній площині.
      </p>

      <p>
        Пряма <span className="font-mono">A→B</span> задається параметрично{' '}
        <span className="font-mono font-bold text-slate-700">P(t) = A + t·(B − A)</span>. Тобто{' '}
        <span className="font-mono">t = 0</span> — точка A, <span className="font-mono">t = 1</span> — точка B, а{' '}
        <span className="font-mono">0 &lt; t &lt; 1</span> — всередині відрізка. Щоб знайти слід, прирівнюємо до нуля ту
        координату, яка визначає площину, і розв'язуємо рівняння відносно <span className="font-mono">t</span>.
      </p>

      <table className="w-full border-collapse font-mono text-[10px]">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="py-0.5 pr-2 font-normal">площина</th>
            <th className="py-0.5 pr-2 font-normal">умова</th>
            <th className="py-0.5 pr-2 font-normal">t</th>
            <th className="py-0.5 font-normal">слід</th>
          </tr>
        </thead>
        <tbody>
          {TRACE_RULES.map((r) => (
            <tr key={r.plane} className="border-t border-slate-200">
              <td className="py-0.5 pr-2 text-slate-700">{r.planeLabel}</td>
              <td className="py-0.5 pr-2">{r.cond}</td>
              <td className="py-0.5 pr-2 text-slate-700">{r.tFormula}</td>
              <td className="py-0.5 font-bold text-slate-700">{r.label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="list-disc space-y-0.5 pl-4">
        <li>
          <span className="font-mono">Δ = 0</span> і <span className="font-mono">a₀ ≠ 0</span> — пряма паралельна площині,
          не перетинає її, слід нескінченно віддалений. На кресленні не малюється.
        </li>
        <li>
          <span className="font-mono">Δ = 0</span> і <span className="font-mono">a₀ = 0</span> — вся пряма лежить у площині,
          тож слідом є вся пряма, а не точка. Теж не малюється.
        </li>
        <li>
          <span className="font-mono">t</span> поза <span className="font-mono">[0; 1]</span> — слід реальний, але лежить на
          прямій <b>за</b> відрізком. Такі позначені «поза відр.».
        </li>
      </ul>
    </div>
  )
}

/** Рядок «що саме рахували» для однієї площини — з підстановкою замість t. */
export function TraceCalcLine({ calc }: { calc: TraceCalc }) {
  const { zeroCoord, a0, delta, t, trace, label, note } = calc
  const ax = zeroCoord.toUpperCase()

  if (t === null || trace === null) {
    return (
      <div className="font-mono text-[10px] leading-[13px] text-slate-500">
        <span className="font-bold text-slate-700">{label}</span>{' '}
        <span className="text-slate-400">
          Δ{ax} = {fmt(delta)} → {note}
        </span>
      </div>
    )
  }

  return (
    <div className="font-mono text-[10px] leading-[13px] text-slate-500">
      <span className="font-bold text-slate-700">{label}</span>{' '}
      Δ{ax} = {fmt(delta)}, t = −{fmt(a0)} / {fmt(delta)} = {fmt(t, 4)} →{' '}
      <span className="text-slate-700">
        ({fmt(trace.x)}; {fmt(trace.y)}; {fmt(trace.z)})
      </span>{' '}
      <span className="text-slate-400">· {note}</span>
    </div>
  )
}
