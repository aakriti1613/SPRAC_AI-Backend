// Basic charts without a chart library: bars (divs), line (SVG), pie (conic-gradient).
import type { ChartPoint, DashboardChartProps } from "@contracts";
import { formatCurrency } from "@core/format";
import { cn } from "@core/ui";
import { useSkin } from "../_skins/context";

const SHADES = [1, 0.75, 0.55, 0.4, 0.3, 0.22, 0.16, 0.12];

function fmt(value: number, format: DashboardChartProps["valueFormat"]) {
  if (format === "currency") return formatCurrency(value);
  if (format === "percent") return `${value}%`;
  return new Intl.NumberFormat("en-IN").format(value);
}

function Bars({ data, format }: { data: ChartPoint[]; format: DashboardChartProps["valueFormat"] }) {
  const s = useSkin();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-fg">{d.label}</span>
            <span className="text-muted">{fmt(d.value, format)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-bg">
            <s.Grow percent={(d.value / max) * 100} className={cn("h-2.5 rounded-full", s.level === "basic" ? "bg-primary" : "bg-gradient-to-r from-primary to-primary-hover")} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Line({ data }: { data: ChartPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const pts = data.map((d, i) => `${(i / Math.max(1, data.length - 1)) * 100},${40 - (d.value / max) * 36}`).join(" ");
  return (
    <div>
      <svg viewBox="0 0 100 42" className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label="Line chart">
        <polyline points={pts} fill="none" stroke="var(--sparc-primary)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function Pie({ data, format }: { data: ChartPoint[]; format: DashboardChartProps["valueFormat"] }) {
  const total = data.reduce((n, d) => n + d.value, 0) || 1;
  let at = 0;
  const stops = data.map((d, i) => {
    const from = at;
    at += (d.value / total) * 100;
    return `color-mix(in srgb, var(--sparc-primary) ${SHADES[i % SHADES.length] * 100}%, transparent) ${from}% ${at}%`;
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="h-36 w-36 rounded-full" style={{ background: `conic-gradient(${stops.join(", ")})` }} role="img" aria-label="Pie chart" />
      <ul className="space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: `color-mix(in srgb, var(--sparc-primary) ${SHADES[i % SHADES.length] * 100}%, transparent)` }} />
            <span className="text-fg">{d.label}</span>
            <span className="text-muted">{fmt(d.value, format)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DashboardChart({ title, variant, data, valueFormat, loading }: DashboardChartProps) {
  const s = useSkin();
  return (
    <section className={cn(s.card, "p-5")} aria-label={title}>
      <h2 className="mb-4 font-semibold text-fg">{title}</h2>
      {loading ? (
        <div className="h-40 animate-pulse rounded-sparc bg-bg" />
      ) : data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No data yet.</p>
      ) : variant === "line" ? (
        <Line data={data} />
      ) : variant === "pie" ? (
        <Pie data={data} format={valueFormat} />
      ) : (
        <Bars data={data} format={valueFormat} />
      )}
    </section>
  );
}
