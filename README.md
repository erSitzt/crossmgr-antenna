# CrossMgr Antenna Planner

A 3D planner for UHF RFID finish-line antennas (Impinj R420/R700 + circularly polarized panels), used with
[CrossMgrImpinj](https://github.com/esitarski/CrossMgr/tree/master/CrossMgrImpinj) and crossmgr-interface.

- **3D scene**: a track built from segments (turns, ramps, finish tables, changing width), finish arch trusses, obstacles (hay bales, banners, barriers, …), and 2–4 antennas with position + yaw / tilt / roll (gizmo: `W` move, `E` rotate). Antennas can be mounted on the truss.
- **RF model**: antenna pattern (gain, beamwidth, front/back), forward link (tag power-up) and reverse link (RSSI), tag dipole orientation and tilt, bike shadowing, detuning near metal, polarisation / body loss, obstacle losses, blocking by the raised track, ground reflection by ground type (track surface and surroundings), ETSI 2 W ERP check.
- **Views**: a 3D read-zone shape per antenna, plus heatmaps at tag height and in the finish plane (strongest antenna / overlap / RSSI / margin).
- **Virtual wall**: simulated passes along straight lanes and realistic rider lines (corner cuts, random lines), with the pass time estimated like CrossMgrImpinj (antenna with most reads → quadratic RSSI peak). Shows the timing offset in cm per line.
- **Power optimiser**: searches per-antenna Tx power (within reader/ETSI limits) for zero missed passes and the wall exactly on the finish line.
- **Layout search**: finds the best number (1–4), placement, aim and power of antennas on the finish arch.
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
- Simulated lanes and rider lines are defined as a share of the local width, so a lane on the left edge of a narrow approach stays on the left edge of a wider table.
- The heatmap slider sets the height above the finish surface.

**Finish arch.** Clear height, span and section are set in *Track & view*. The truss base follows the track elevation, so an arch on a finish table stands on the table (switch this off to set the base elevation yourself). A warning appears if the uprights stand on the track, with a button to fit the span.

**Truss mounts.** In the *Antennas* tab, an antenna can be mounted on the left upright, right upright or crossbar at a set height or offset. Mounted antennas follow the truss when its height, span or position changes. The move gizmo then slides them along the member.

**Ground and finish table.** Ground reflection uses Fresnel coefficients from the ground's permittivity and conductivity, reduced by surface roughness, and depends on the tag's orientation. Each reflected ray bounces off the surface where it actually lands:

- on the track (table top, ramps) → at that elevation, with the **track surface** material;
- beside the track → on the terrain at Y = 0, with the **surroundings** material (e.g. grass).

A direct ray that passes through the raised track body (an antenna below the table edge looking at a tag on the table) gets an extra loss, *Blocked by track body* (default 25 dB).

Ground presets:

| Preset | εr | σ (S/m) | Roughness |
| --- | --- | --- | --- |
| Hard-packed clay soil (moist) | 15 | 0.05 | 3 cm |
| Wet clay / mud | 25 | 0.2 | 5 cm |
| Dry soil / loam | 6 | 0.005 | 3 cm |
| Grass / meadow (moist soil) | 12 | 0.02 | 5 cm |
| Dry sand | 3.5 | 0.001 | 5 cm |
| Wet sand | 20 | 0.05 | 5 cm |
| Asphalt | 5 | 0.005 | 0.5 cm |
| Concrete | 6.5 | 0.02 | 0.5 cm |

Moisture matters most: the same clay reflects much more after watering than when dry. Treat the values as starting points and correct them with the live calibration.

**Obstacles.** Add them in the *Antennas* tab (*+ Obstacle…*). Each obstacle is a row of identical boxes with a material. A ray loses *loss per crossing* plus *loss inside × metres travelled inside*, on the direct path and on both legs of the reflected path (capped at 40 dB, since signal bends around objects). Obstacles stand on the ground beside the track, on the track surface (e.g. on the table) or at a manual elevation, and can be raised (banners on a fence).

| Material | per crossing | per metre |
| --- | --- | --- |
| Hay / straw bale (dry) | 0.5 dB | 4 dB/m |
| Hay / straw bale (damp) | 1 dB | 15 dB/m |
| Mesh banner (PVC) | 1.5 dB | – |
| Solid banner / tarp (PVC) | 3 dB | – |
| Water-filled plastic barrier | 1 dB | 60 dB/m |
| Tyre wall | 1 dB | 10 dB/m |
| Wooden board / pallets | 1 dB | 6 dB/m |
| Metal crowd barrier / fence | 12 dB | – |
| Spectators / people | 3 dB | 8 dB/m |
| Vehicle / container / timing box (metal) | 30 dB | – |

These are typical starting values; water content matters most (a damp bale absorbs far more than a dry one).

Setup files from older versions (single turn, single width, single |Γ| value, no obstacles) are converted automatically on load or import.

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

## Rider lines

Riders rarely hold a lane. In the *Simulation* tab, **Rider lines** are simulated alongside the straight lanes:

- **Custom lines**: a list of points, each "distance to the finish (− = before)" and "position across the track in % of the local width" (−50 % = left edge, +50 % = right edge, in direction of travel). The rider moves smoothly between points and holds the first/last position outside them. ⇆ mirrors a line.
- **Presets**: corner cut right edge → crosses left, corner cut left edge → crosses right, tight on the left edge, swing wide right. The finish-after-a-turn presets start with a matching corner-cut line (after a right turn: in on the right edge, across to the left antennas).
- **Random lines**: extra smooth lines with random entry, crossing and exit positions (seeded, reproducible).

The timing error of each line is measured against the moment it really crosses the finish plane. The tag orientation follows the actual direction of travel. All lines count in the optimiser. In 3D, straight lanes are grey, rider lines orange (random: dashed). The red wall connects the straight lanes; orange dots mark where timing fires on each rider line.

## Tag on the bike

The tag settings (*Antennas → Tag, reader & environment*) describe how the tag is mounted:

| Setting | Meaning |
| --- | --- |
| Dipole axis + Tilt back | Direction of the inlay's dipole: vertical (up the fork / plate), across or along the bike, tilted back like the fork rake (≈ 27°) or number plate (≈ 25°) |
| Mounted on | Fork leg, front plate, side plate or helmet (where the 3D bike shows the tag) |
| Bike side + Bike shadow | A tag on the left fork leg is hidden from right-side antennas by fork, wheel and engine; a front-plate tag is hidden from behind. The loss grows to the set value towards the fully shadowed side |
| Near metal + Gap | A plain dipole inlay directly on metal is practically shorted (≈ 25 dB loss each way); 15 mm (fork guard) ≈ 4.5 dB, 40 mm ≈ 1 dB |

Presets for the **Avery Dennison Dogbone with Impinj M730** (−22 dBm effective sensitivity, allowing ~2 dB for mounting against the chip's ~−24 dBm): on the left fork leg (on the fork guard, 15 mm from the tube), on the front plate horizontal or vertical, and under the left side plate. Adjust the mounting values to your holders and calibrate with live reads.

**Bike view.** A simplified motocross bike (optional rider) rides on the lane or rider line selected in the simulation, at an adjustable distance to the finish. The tag is drawn at its mounting point with its dipole axis (yellow). Lines to every antenna show the link margin at that spot (green ≥ 6 dB, orange 0–6 dB, red dashed = no read). A table lists tag power, RSSI, bike shadow and margin per antenna.

Things this makes visible:
- An antenna looking along the dipole axis (e.g. overhead antenna vs. vertical fork tag) barely reads it.
- An antenna on the far side of a side-mounted tag loses the bike-shadow value.
- The receiver sensitivity (Rx) is often the limit: the tag powers up, but its reply is below the reader's threshold.

## Layout search

*Simulation → Antenna layout search* finds the best antenna setup on the finish arch:

1. **Placements tried:**
   - uprights (left/right) at 0.5 m height steps, aimed across the track or turned 30° towards oncoming riders, level / 15° / 30° down;
   - crossbar at five offsets, pointing straight down or tilted 30° towards riders.

   You choose which truss members are allowed, the antenna model and the maximum count.
2. **Search:** antennas are added one at a time (the best remaining placement each time), then every antenna is re-tried at every free placement while the others stay. The placements are compared with all lanes and rider lines at a fixed *search power*, using a reduced trial count.
3. **Power:** optionally, the per-antenna power is optimised for each result.
4. **Results:** a table with the best layout for each count (score, missed passes, offset, spread, worst line). **Apply** replaces the current antennas with that layout, mounted on the truss.

More antennas are not automatically better: the reader switches between ports, so every extra antenna takes read time from the others. A full 1–4 antenna search takes roughly 15–60 s.

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
- The link model is free space plus one ground-reflected ray. Obstacles only attenuate: signal bending around them (diffraction) and reflections off them (e.g. a metal fence acting as a mirror) are not modelled. Bikes, riders and mud are a flat loss. Use the live calibration to correct the model.
- The 3D read zones and heatmaps assume a tag travelling straight through the finish (+X). The pass simulation follows the real track curve, width and elevation.
- The pass-time method mirrors CrossMgrImpinj's approach as understood, not its exact code.
- The receiver sensitivity is applied as a software RSSI filter in live mode.
