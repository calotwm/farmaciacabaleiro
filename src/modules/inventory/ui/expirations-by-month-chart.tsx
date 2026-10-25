export interface MonthBar {
  key: string;
  label: string;
  lots: number;
  units: number;
}

const W = 480;
const H = 176;
const PLOT_TOP = 22;
const PLOT_BOTTOM = 128;

/**
 * Units expiring per month as a plain SVG bar chart (no chart library). Figures come from the same filters as
 * the table. Accessible: the SVG is labelled and a visually hidden table repeats every value.
 */
export function ExpirationsByMonthChart({ months }: { months: MonthBar[] }) {
  const max = Math.max(1, ...months.map((month) => month.units));
  const slot = W / Math.max(months.length, 1);
  const barWidth = Math.min(44, slot * 0.58);
  const plotHeight = PLOT_BOTTOM - PLOT_TOP;
  const total = months.reduce((sum, month) => sum + month.units, 0);

  return (
    <section aria-labelledby="chart-months" className="bg-card grid content-start gap-3 rounded-xl border p-4">
      <div className="grid gap-0.5">
        <h2 id="chart-months" className="text-sm font-semibold">
          Unidades por mes de vencimiento
        </h2>
        <p className="text-muted-foreground text-xs">Lotes con stock, próximos {months.length} meses (el actual cuenta desde hoy).</p>
      </div>
      {total === 0 ? (
        <p className="text-muted-foreground py-6 text-sm">No hay stock que venza en este período.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Unidades que vencen por mes: ${months.map((m) => `${m.label} ${m.units}`).join(", ")}`} className="h-auto w-full">
          <line x1={0} x2={W} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} className="stroke-border" strokeWidth={1} />
          {months.map((month, index) => {
            const height = month.units === 0 ? 0 : Math.max(2, (month.units / max) * plotHeight);
            const x = slot * index + (slot - barWidth) / 2;
            const cx = slot * index + slot / 2;
            return (
              <g key={month.key}>
                <rect x={x} y={PLOT_BOTTOM - height} width={barWidth} height={height} rx={2} className="fill-foreground/80" />
                <text x={cx} y={PLOT_BOTTOM - height - 6} textAnchor="middle" className="fill-foreground text-[12px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {month.units.toLocaleString("es-AR")}
                </text>
                <text x={cx} y={PLOT_BOTTOM + 16} textAnchor="middle" className="fill-muted-foreground text-[12px]">
                  {month.label.split(" ")[0]}
                </text>
                <text x={cx} y={PLOT_BOTTOM + 31} textAnchor="middle" className="fill-muted-foreground text-[11px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {month.lots} {month.lots === 1 ? "lote" : "lotes"}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <table className="sr-only">
        <caption>Unidades y lotes que vencen por mes</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Unidades</th>
            <th scope="col">Lotes</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.key}>
              <th scope="row">{month.label}</th>
              <td>{month.units}</td>
              <td>{month.lots}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
