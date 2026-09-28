import { useEffect, useRef } from 'react';
import { finishElevation } from './rf/track';
import { computeSliceAsync, computeZonesAsync, runSimAsync } from './rf/workerClient';
import { useStore } from './store';

/** Recompute read zones, slices and (optionally) the pass simulation whenever the setup changes. */
export function useCompute() {
  const setup = useStore((s) => s.setup);
  const view = useStore((s) => s.view);
  const setFields = useStore((s) => s.setFields);
  const setSim = useStore((s) => s.setSim);
  const gen = useRef(0);
  const simGen = useRef(0);

  const withLimit = view.sliceMode === 'limit';
  useEffect(() => {
    const my = ++gen.current;
    const timer = setTimeout(async () => {
      setFields({ computing: true });
      try {
        const [zones, sliceH, sliceF] = await Promise.all([
          view.showZones ? computeZonesAsync(setup, view.zoneStep) : Promise.resolve([]),
          view.showHorizontal ? computeSliceAsync(setup, { kind: 'horizontal', at: finishElevation(setup.track) + view.sliceHeight, step: 0.1, withLimit }) : Promise.resolve(null),
          view.showFinishSlice ? computeSliceAsync(setup, { kind: 'finish', at: 0, step: 0.05, withLimit }) : Promise.resolve(null),
        ]);
        if (my === gen.current) setFields({ zones, sliceH, sliceF, computing: false });
      } catch (e) {
        console.error(e);
        if (my === gen.current) setFields({ computing: false });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [setup, view.showZones, view.zoneStep, view.showHorizontal, view.sliceHeight, view.showFinishSlice, withLimit, setFields]);

  useEffect(() => {
    if (!view.autoSim) return;
    const my = ++simGen.current;
    const timer = setTimeout(async () => {
      if (useStore.getState().simBusy) return;
      try {
        const sim = await runSimAsync(setup);
        if (my === simGen.current) setSim({ sim });
      } catch (e) {
        console.error(e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [setup, view.autoSim, setSim]);
}
