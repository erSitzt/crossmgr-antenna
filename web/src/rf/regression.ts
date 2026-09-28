export interface Read {
  t: number; // seconds, 0 = true finish crossing
  port: number;
  antennaId: string;
  rssi: number;
  tagNo?: 1 | 2; // which physical tag answered (same EPC – the reader cannot tell)
}

/** Least-squares fit rssi = a t^2 + b t + c. Returns null if singular. */
export function quadFit(ts: number[], ys: number[]): { a: number; b: number; c: number } | null {
  const n = ts.length;
  if (n < 3) return null;
  // centre time for numerical stability
  const tm = ts.reduce((s, t) => s + t, 0) / n;
  let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < n; i++) {
    const t = ts[i] - tm, y = ys[i], t2 = t * t;
    s1 += t; s2 += t2; s3 += t2 * t; s4 += t2 * t2;
    y0 += y; y1 += y * t; y2 += y * t2;
  }
  // normal equations [s4 s3 s2; s3 s2 s1; s2 s1 s0] [a b c] = [y2 y1 y0]
  const M = [
    [s4, s3, s2, y2],
    [s3, s2, s1, y1],
    [s2, s1, s0, y0],
  ];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 4; c++) M[r][c] -= f * M[col][c];
    }
  }
  const a = M[0][3] / M[0][0], bc = M[1][3] / M[1][1], cc = M[2][3] / M[2][2];
  // shift back from centred time: a(t-tm)^2 + bc(t-tm) + cc
  return { a, b: bc - 2 * a * tm, c: a * tm * tm - bc * tm + cc };
}

export type AntennaChoice = 'mostReads' | 'strongest';
export type TimeMethod = 'quadratic' | 'strongest' | 'first';

/**
 * Pass-time estimate modelled on CrossMgrImpinj's TagGroup logic:
 * pick one antenna (most reads or strongest read), then estimate the time from its reads
 * (quadratic regression peak, strongest read, or first read).
 */
export function estimatePassTime(reads: Read[], choice: AntennaChoice, method: TimeMethod): number | null {
  if (reads.length === 0) return null;
  if (method === 'first') return Math.min(...reads.map((r) => r.t));
  const byAnt = new Map<string, Read[]>();
  for (const r of reads) {
    const l = byAnt.get(r.antennaId);
    if (l) l.push(r);
    else byAnt.set(r.antennaId, [r]);
  }
  let best: Read[] = [];
  let bestScore = -Infinity;
  for (const l of byAnt.values()) {
    const score = choice === 'mostReads' ? l.length + Math.max(...l.map((r) => r.rssi)) * 1e-6 : Math.max(...l.map((r) => r.rssi));
    if (score > bestScore) { bestScore = score; best = l; }
  }
  const strongest = best.reduce((m, r) => (r.rssi > m.rssi ? r : m), best[0]);
  if (method === 'strongest') return strongest.t;
  const fit = quadFit(best.map((r) => r.t), best.map((r) => r.rssi));
  if (!fit || fit.a >= 0) return strongest.t;
  const tPeak = -fit.b / (2 * fit.a);
  const tMin = best[0].t, tMax = best[best.length - 1].t;
  if (tPeak < tMin || tPeak > tMax) return strongest.t;
  return tPeak;
}
