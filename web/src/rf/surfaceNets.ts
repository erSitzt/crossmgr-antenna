/**
 * Naive surface nets iso-surface extraction on a regular grid.
 * field index = i + nx * (j + ny * k); inside where value > iso.
 * The field is padded with "outside" so every surface is closed.
 * Returns positions in world coordinates (origin + index * step) and triangle indices.
 */
export function surfaceNets(
  field: Float32Array,
  dims: [number, number, number],
  origin: [number, number, number],
  step: number,
  iso = 0,
): { positions: Float32Array; indices: Uint32Array } {
  const [nx0, ny0, nz0] = dims;
  const nx = nx0 + 2, ny = ny0 + 2, nz = nz0 + 2;
  const OUT = -1e6;
  const f = new Float32Array(nx * ny * nz).fill(OUT);
  for (let k = 0; k < nz0; k++)
    for (let j = 0; j < ny0; j++)
      for (let i = 0; i < nx0; i++)
        f[i + 1 + nx * (j + 1 + ny * (k + 1))] = field[i + nx0 * (j + ny0 * k)] - iso;

  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const cx = nx - 1, cy = ny - 1;
  const cellVert = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const cidx = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  const pos: number[] = [];

  const corner = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float32Array(8);

  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, d] = corner[c];
          v[c] = f[idx(i + a, j + b, k + d)];
          if (v[c] > 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [e0, e1] of edges) {
          const a = v[e0], b = v[e1];
          if (a > 0 === b > 0) continue;
          // clamp huge padding values so the vertex stays near the real boundary
          const aa = Math.max(a, -50), bb = Math.max(b, -50);
          const t = aa / (aa - bb);
          const p0 = corner[e0], p1 = corner[e1];
          sx += p0[0] + t * (p1[0] - p0[0]);
          sy += p0[1] + t * (p1[1] - p0[1]);
          sz += p0[2] + t * (p1[2] - p0[2]);
          n++;
        }
        cellVert[cidx(i, j, k)] = pos.length / 3;
        pos.push(
          origin[0] + (i + sx / n - 1) * step,
          origin[1] + (j + sy / n - 1) * step,
          origin[2] + (k + sz / n - 1) * step,
        );
      }

  const tris: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, d, c, a, c, b);
    else tris.push(a, b, c, a, c, d);
  };

  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const f0 = f[idx(i, j, k)] > 0;
        if (i < nx - 1 && f0 !== f[idx(i + 1, j, k)] > 0)
          quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], !f0);
        if (j < ny - 1 && f0 !== f[idx(i, j + 1, k)] > 0)
          quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], !f0);
        if (k < nz - 1 && f0 !== f[idx(i, j, k + 1)] > 0)
          quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], !f0);
      }

  return { positions: new Float32Array(pos), indices: new Uint32Array(tris) };
}
