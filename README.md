# CrossMgr Antenna Planner

A 3D planner for UHF RFID finish-line antennas (Impinj R420/R700 + circularly polarized panels), used with
[CrossMgrImpinj](https://github.com/esitarski/CrossMgr/tree/master/CrossMgrImpinj) and crossmgr-interface.

- **3D scene**: a track built from segments (turns, ramps, finish tables, changing width), finish arch trusses, and 2–4 antennas with position + yaw / tilt / roll (gizmo: `W` move, `E` rotate). Antennas can be mounted on the truss.
- **RF model**: antenna pattern (gain, beamwidth, front/back), forward link (tag power-up) and reverse link (RSSI), tag dipole orientation, polarisation / body loss, ground reflection by ground type, ETSI 2 W ERP check.
- **Views**: a 3D read-zone shape per antenna, plus heatmaps at tag height and in the finish plane (strongest antenna / overlap / RSSI / margin).
- **Virtual wall**: simulated passes per lane, with the pass time estimated like CrossMgrImpinj (antenna with most reads → quadratic RSSI peak). Shows the timing offset in cm per lane.
- **Power optimiser**: searches per-antenna Tx power (within reader/ETSI limits) for zero missed passes and the wall exactly on the finish line.
- **Live reader**: direct LLRP via sllurp. Pushes per-port power, groups reads into passes, plots RSSI curves, records sessions, and calibrates the model per port (measured vs. simulated peak RSSI).

Coordinates: X = direction of travel at the finish (finish plane X = 0), Z = across the track (+ = rider's right), Y = up (absolute elevation).

## Track, arch and ground

**Track segments** (*Track & view* tab). The track is a chain of segments in the direction of travel:

| Setting | Meaning |
| --- | --- |
| Type | Straight, left turn or right turn |
| Length / Radius + Angle | Straight length, or turn radius (centreline) and angle |
| Height change | Elevation gained (+) or lost (−) over the segment: ramps, finish tables, drops |
| Width | Track width in this segment; with **Taper** it changes gradually from the previous segment's width |
| Finish | Pick the segment that contains the finish line and its distance into the segment |

Segments can be inserted, reordered and deleted. An elevation profile shows the layout with the finish marked. The 3D view is always centred on the finish line.

Presets cover straight, finish before / after a left or right turn, and a **finish table after a 90° turn** (approach → turn → ramp up → table with finish → ramp down).

Things that follow the track:
- Tag heights are measured from the local track surface, so tags ride up ramps.
- Simulated lanes keep their share of the local width, so a lane on the left edge of a narrow approach stays on the left edge of a wider table.
- The heatmap slider sets the height above the finish surface.

**Finish arch.** Clear height, span and section are set in *Track & view*. The truss base follows the track elevation, so an arch on a finish table stands on the table (switch this off to set the base elevation yourself). A warning appears if the uprights stand on the track, with a button to fit the span.

**Truss mounts.** In the *Antennas* tab, an antenna can be mounted on the left upright, right upright or crossbar at a set height or offset. Mounted antennas follow the truss when its height, span or position changes. The move gizmo then slides them along the member.

**Ground type.** Ground reflection uses Fresnel coefficients from the ground's permittivity and conductivity, reduced by surface roughness, and depends on the tag's orientation. Presets:

| Preset | εr | σ (S/m) | Roughness |
| --- | --- | --- | --- |
| Hard-packed clay soil (moist) | 15 | 0.05 | 3 cm |
| Wet clay / mud | 25 | 0.2 | 5 cm |
| Dry soil / loam | 6 | 0.005 | 3 cm |
| Dry sand | 3.5 | 0.001 | 5 cm |
| Wet sand | 20 | 0.05 | 5 cm |
| Asphalt | 5 | 0.005 | 0.5 cm |
| Concrete | 6.5 | 0.02 | 0.5 cm |

Moisture matters most: the same clay reflects much more after watering than when dry. Treat the values as starting points and correct them with the live calibration.

Setup files from older versions (single turn, single width, single |Γ| value) are converted automatically on load or import.

## Run with Docker (recommended)

```bash
docker compose up --build
```

Open http://localhost:18787 (another host port: `HOST_PORT=18789 docker compose up -d`). The container connects out to the reader (LLRP, TCP 5084) over normal bridge networking.

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
- The link model is free space plus one ground-reflected ray off a flat plane at the finish elevation. Ramps, table edges, bikes and riders do not block or reflect; bikes, riders and mud are a flat loss. Use the live calibration to correct the model.
- The 3D read zones and heatmaps assume a tag travelling straight through the finish (+X). The pass simulation follows the real track curve, width and elevation.
- The pass-time method mirrors CrossMgrImpinj's approach as understood, not its exact code.
- The receiver sensitivity is applied as a software RSSI filter in live mode.
