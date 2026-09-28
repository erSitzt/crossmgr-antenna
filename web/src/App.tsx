import { useEffect, useState } from 'react';
import { Viewport, type CameraPreset } from './scene/Viewport';
import { useStore } from './store';
import { HardwarePanel } from './ui/HardwarePanel';
import { LivePanel } from './ui/LivePanel';
import { SetupPanel } from './ui/SetupPanel';
import { SimPanel } from './ui/SimPanel';
import { useCompute } from './useCompute';

type Tab = 'setup' | 'hardware' | 'sim' | 'live';

export function App() {
  useCompute();
  const [tab, setTab] = useState<Tab>('hardware');
  const [cam, setCam] = useState<{ preset: CameraPreset; nonce: number }>({ preset: 'perspective', nonce: 0 });
  const computing = useStore((s) => s.computing);
  const setMode = useStore((s) => s.setTransformMode);
  const select = useStore((s) => s.select);
  const name = useStore((s) => s.setup.name);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
      if (e.key === 'w') setMode('translate');
      else if (e.key === 'e') setMode('rotate');
      else if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setMode, select]);

  const camBtn = (preset: CameraPreset, label: string) => (
    <button onClick={() => setCam((c) => ({ preset, nonce: c.nonce + 1 }))}>{label}</button>
  );

  return (
    <div className="app">
      <div className="viewport">
        <Viewport preset={cam.preset} nonce={cam.nonce} />
        <div className="overlay top-left">
          <strong>{name}</strong>
          {computing && <span className="muted"> · computing…</span>}
        </div>
        <div className="overlay bottom-left">
          {camBtn('perspective', '3D')}
          {camBtn('top', 'Top')}
          {camBtn('side', 'Finish view')}
          {camBtn('rider', 'Rider')}
        </div>
      </div>
      <aside className="sidebar">
        <nav className="tabs">
          {(
            [
              ['setup', 'Track & view'],
              ['hardware', 'Antennas'],
              ['sim', 'Simulation'],
              ['live', 'Live reader'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="panel">
          {tab === 'setup' && <SetupPanel />}
          {tab === 'hardware' && <HardwarePanel />}
          {tab === 'sim' && <SimPanel />}
          {tab === 'live' && <LivePanel />}
        </div>
      </aside>
    </div>
  );
}
