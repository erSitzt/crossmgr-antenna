import type { LinePoint, RiderLine } from '../model/types';
import { newId } from '../model/ids';
import { LINE_PRESETS, makeLine } from '../rf/lines';
import { useStore } from '../store';
import { Check, NumField, Section } from './controls';

/** Straight lanes, custom rider lines (corner cuts …) and random lines for the pass simulation. */
export function RiderLinesSection() {
  const sim = useStore((s) => s.setup.sim);
  const updateSim = useStore((s) => s.updateSim);
  const lines = sim.lines;
  const setLines = (next: RiderLine[]) => updateSim({ lines: next });
  const setLine = (id: string, p: Partial<RiderLine>) => setLines(lines.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const setPoint = (l: RiderLine, i: number, p: Partial<LinePoint>) =>
    setLine(l.id, { points: l.points.map((q, j) => (j === i ? { ...q, ...p } : q)) });

  return (
    <Section
      title="Rider lines"
      actions={
        <select
          className="add-select"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (v === 'custom') setLines([...lines, { id: newId('line'), name: 'Custom line', enabled: true, points: [{ sM: -10, frac: 0 }, { sM: 0, frac: 0 }] }]);
            else setLines([...lines, makeLine(v, newId('line'))]);
          }}
        >
          <option value="">+ Line…</option>
          {LINE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          <option value="custom">Custom (straight, edit points)</option>
        </select>
      }
    >
      <div className="grid2">
        <Check label="Straight lanes" value={sim.includeLanes} onChange={(includeLanes) => updateSim({ includeLanes })} />
        <NumField label="Lanes" value={sim.lanes} min={1} max={25} step={1} onChange={(lanes) => updateSim({ lanes: Math.round(lanes) })} />
        <NumField label="Random lines" value={sim.randomLines} min={0} max={30} step={1} title="Extra smooth lines with random entry, crossing and exit positions (seeded)" onChange={(randomLines) => updateSim({ randomLines: Math.round(randomLines) })} />
      </div>
      <p className="muted">
        A line is a list of points: distance to the finish (− = before) and position across the track in % of the local width
        (−50 % = left edge, +50 % = right edge, in direction of travel). The rider moves smoothly between points.
      </p>
      {lines.map((l) => (
        <div key={l.id} className="arch">
          <div className="seg-head">
            <input type="checkbox" checked={l.enabled} onChange={(e) => setLine(l.id, { enabled: e.target.checked })} />
            <input className="line-name" value={l.name} onChange={(e) => setLine(l.id, { name: e.target.value })} />
            <span className="seg-actions">
              <button title="Mirror left/right" onClick={() => setLine(l.id, { points: l.points.map((q) => ({ ...q, frac: -q.frac })) })}>⇆</button>
              <button className="danger" title="Delete line" onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>×</button>
            </span>
          </div>
          <table className="tbl points">
            <thead>
              <tr><th>Distance to finish</th><th>Across (% width)</th><th /></tr>
            </thead>
            <tbody>
              {l.points.map((q, i) => (
                <tr key={i}>
                  <td><NumField label="" unit="m" value={q.sM} step={1} onChange={(sM) => setPoint(l, i, { sM })} /></td>
                  <td>
                    <NumField label="" unit="%" value={Math.round(q.frac * 100)} min={-50} max={50} step={5} onChange={(pct) => setPoint(l, i, { frac: pct / 100 })} />
                  </td>
                  <td>
                    <button disabled={l.points.length <= 1} onClick={() => setLine(l.id, { points: l.points.filter((_, j) => j !== i) })}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            className="link"
            onClick={() => {
              const last = l.points[l.points.length - 1];
              setLine(l.id, { points: [...l.points, { sM: (last?.sM ?? 0) + 5, frac: last?.frac ?? 0 }] });
            }}
          >
            + Point
          </button>
        </div>
      ))}
    </Section>
  );
}
