# Build Calc

An offline, private calculator for the job site and the desk. No ads, no accounts, no tracking.
Everything you save stays on your device.

**Screens**

| Screen | What it does |
|---|---|
| **Basic** | Full-expression entry (`12+4×3`), always-visible history tape, M+ M− MR MC plus named memories, BC tax (GST 5% / PST 7%, editable), markup/margin, % change, tip/split. Large glove-friendly keys. |
| **Build** | Construction Master-style keypad with **ft / in / fraction** keys (`12' 6 3⁄8" × 4`), length × length = sq ft, × again = cu ft/yd. Imperial by default with a one-tap metric toggle. 1/16" precision (1/8–1/64 in Settings). |
| | Calculators: roof pitch & rafters (x/12 + degrees, hip/valley, roof squares) · stairs with **BC Building Code 2024** rise/run check · wall framing (studs, plates, headers) · right triangle / check-square / 3-4-5 · board feet (nominal, actual sizes shown) · concrete (m³, yd³, bags) · drywall/sheathing · gravel/fill/topsoil · area & perimeter · decking & joists · paint · flooring/tile. Default 10% waste, editable. |
| **Sci** | Textbook-style display, 2nd-function keys, DEG/RAD/GRAD, trig + hyperbolic, logs, powers, roots, factorial, nCr/nPr. Turn the phone sideways for the wide keypad. Also: graphing (3 functions, pan/zoom/trace), quadratic + 2×2/3×3 solver, unit converter, statistics, hex/bin/oct, full constants list (CODATA 2018). |
| **Sketch** | Stylus sketch pad: pressure-sensitive pen, eraser, straight lines with 15° and grid snap, **dimension lines that measure themselves from the grid scale**, text labels, undo/redo, palm rejection once a pen is used. Export PNG/PDF. |
| **Jobs** | Every save goes into a job ("Smith reno"). Export a job to **.xlsx / .csv (Google Sheets)** or **.docx (Google Docs, sketches included)**. Files are built on the phone; use **Share…** to send them to Drive. |

## Voice (fully offline)

Tap any 🎙 to speak: *"twelve feet six and three eighths inches times four"*, *"square root of sixteen plus two point five"*,
or dictate notes. Speech recognition runs on the phone with [Vosk](https://alphacephei.com/vosk/) (WebAssembly);
audio never leaves the device. The first time, the app asks before downloading the English model (~40 MB) once.

To host the model yourself instead, put `vosk-model-small-en-us-0.15.tar.gz` in a `models/` folder and set
`voiceModelUrl` to `models/vosk-model-small-en-us-0.15.tar.gz` in `js/store.js`.

## Install on your phone

1. Open the GitHub Pages link for this repo in Chrome (Android) or Safari (iPhone).
2. Android: menu ⋮ → **Install app** / **Add to Home screen**. iPhone: Share → **Add to Home Screen**.
3. Open it once while online; after that it works with no signal.

## Privacy

- The page's Content-Security-Policy only allows the app to talk to itself, plus the one-time voice model download.
- Data is in the browser's IndexedDB on your device. Clearing site data, or Settings → Delete all data, removes it.
- There is no backup by design. Export jobs you want to keep.

## Develop

No build step. Serve the folder (`python3 -m http.server`) and open `http://localhost:8000`.
Run the tests with `npm test` (Node 20+). Bump `VERSION` in `sw.js` when you change files so installed copies update.

Stair limits: BC Building Code 2024, Div. B, Part 9, Tables 9.8.4.1 and 9.8.4.2 (private rise 125–200 mm, run 255–355 mm;
public rise 125–180 mm, run ≥ 280 mm). Always confirm with your local authority having jurisdiction.
