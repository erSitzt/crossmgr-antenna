# CrossMgr Antenna Planner

A 3D planner for UHF RFID finish-line antennas (Impinj R420/R700 + circularly polarized panels), used with
[CrossMgrImpinj](https://github.com/esitarski/CrossMgr/tree/master/CrossMgrImpinj) and crossmgr-interface.

- **3D scene**: finish arch trusses, 2–4 antennas with position + yaw / tilt / roll (gizmo: `W` move, `E` rotate), and a straight / left-turn / right-turn track.
- **RF model**: antenna pattern (gain, beamwidth, front/back), forward link (tag power-up) and reverse link (RSSI), tag dipole orientation, polarisation / body loss, optional ground reflection, ETSI 2 W ERP check.
- **Views**: a 3D read-zone shape per antenna, plus heatmaps at tag height and in the finish plane (strongest antenna / overlap / RSSI / margin).
- **Virtual wall**: simulated passes per lane, with the pass time estimated like CrossMgrImpinj (antenna with most reads → quadratic RSSI peak). Shows the timing offset in cm per lane.
- **Power optimiser**: searches per-antenna Tx power (within reader/ETSI limits) for zero missed passes and the wall exactly on the finish line.
- **Live reader**: direct LLRP via sllurp. Pushes per-port power, groups reads into passes, plots RSSI curves, records sessions, and calibrates the model per port (measured vs. simulated peak RSSI).

Coordinates: X = direction of travel (finish plane X = 0), Z = across the track (+ = rider's right), Y = up.

## Run with Docker (recommended)

```bash
docker compose up --build
```

Open http://localhost:18787. The container connects out to the reader (LLRP, TCP 5084) over normal bridge networking.

## Run for development

```bash
cd web && npm install && npm run dev        # http://localhost:5173
cd server && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt && .venv/Scripts/python app.py
```

The dev server proxies `/ws` and `/api` to the backend on port 18787 (override with the `PORT` env var).
Tests: `cd web && npm test`.

## Live tuning workflow

1. **Stop CrossMgrImpinj.** An Impinj reader accepts only one LLRP client.
2. In **Live reader**, enter the reader IP → Connect → **Push antenna config** (ports + Tx power from the scene) → Start.
3. Pick the lane (**Next pass lane**) and walk/ride the test tag through. Repeat for several lanes.
4. The **Calibration** table shows measured − model peak RSSI per port. Apply it to fold the offset into the antenna's loss.
5. Re-run **Simulation → Optimise power**, apply, push to the reader again and verify.
6. Enter the final per-port powers in CrossMgrImpinj.

The *Mock reader* option generates synthetic passes for testing without hardware.

## Caveats

- Antenna datasheet values (beamwidth, F/B) are typical assumptions. Check them against your models in *Antenna models*.
- The link model is free-space plus an optional two-ray ground reflection. Bikes, riders and mud are modelled as a flat loss. Use the live calibration to correct the model.
- The pass-time method mirrors CrossMgrImpinj's approach as understood, not its exact code.
- The receiver sensitivity is applied as a software RSSI filter in live mode.
