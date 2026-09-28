import { portColor } from '../store';

export interface ChartRead {
  t: number; // seconds relative to finish crossing
  port: number;
  rssi: number;
}

/** RSSI over time, one colour per reader port, with finish (t=0) and estimate markers. */
export function RssiChart({ reads, estimate, height = 170 }: { reads: ChartRead[]; estimate?: number | null; height?: number }) {
  const W = 360, H = height, pad = { l: 34, r: 8, t: 8, b: 22 };
  if (reads.length === 0) return <div className="chart-empty">No reads</div>;
  const ts = reads.map((r) => r.t);
  const rs = reads.map((r) => r.rssi);
  let tMin = Math.min(...ts, estimate ?? 0, 0), tMax = Math.max(...ts, estimate ?? 0, 0);
  if (tMax - tMin < 0.1) { tMin -= 0.05; tMax += 0.05; }
  const rMin = Math.floor(Math.min(...rs) - 2), rMax = Math.ceil(Math.max(...rs) + 2);
  const x = (t: number) => pad.l + ((t - tMin) / (tMax - tMin)) * (W - pad.l - pad.r);
  const y = (r: number) => pad.t + ((rMax - r) / (rMax - rMin)) * (H - pad.t - pad.b);
  const ticks = 5;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%">
      {Array.from({ length: ticks + 1 }, (_, i) => rMin + ((rMax - rMin) * i) / ticks).map((r) => (
        <g key={r}>
          <line x1={pad.l} x2={W - pad.r} y1={y(r)} y2={y(r)} className="gridline" />
          <text x={pad.l - 4} y={y(r) + 3} textAnchor="end">{r.toFixed(0)}</text>
        </g>
      ))}
      {Array.from({ length: ticks + 1 }, (_, i) => tMin + ((tMax - tMin) * i) / ticks).map((t) => (
        <text key={t} x={x(t)} y={H - 6} textAnchor="middle">{(t * 1000).toFixed(0)}</text>
      ))}
      <line x1={x(0)} x2={x(0)} y1={pad.t} y2={H - pad.b} className="finish" />
      {estimate != null && <line x1={x(estimate)} x2={x(estimate)} y1={pad.t} y2={H - pad.b} className="estimate" />}
      {reads.map((r, i) => (
        <circle key={i} cx={x(r.t)} cy={y(r.rssi)} r={2.2} fill={portColor(r.port)} />
      ))}
      <text x={W - pad.r} y={pad.t + 8} textAnchor="end" className="legend">ms / dBm · white = finish · red = estimate</text>
    </svg>
  );
}
