// Pure construction formulas. All lengths in inches unless noted.
// Each returns plain numbers; the UI formats them.

const DEG = 180 / Math.PI;
const ceil = (x) => Math.ceil(x - 1e-9); // avoid 10.0000001 -> 11
const withWaste = (q, wastePct) => q * (1 + (wastePct || 0) / 100);

// BC Building Code 2024, Div. B, Part 9: Tables 9.8.4.1 (rise) and 9.8.4.2 (run),
// headroom 9.8.2.2, width 9.8.2.1. Values in mm; editable in Settings.
export const BC_STAIR_CODE = {
  private: { riseMin: 125, riseMax: 200, runMin: 255, runMax: 355, headroom: 1950, widthMin: 860 },
  public: { riseMin: 125, riseMax: 180, runMin: 280, runMax: Infinity, headroom: 2050, widthMin: 900 },
};

// Nominal -> actual dressed lumber size (inches), common Canadian/US softwood.
export const ACTUAL = { 1: 0.75, 2: 1.5, 3: 2.5, 4: 3.5, 5: 4.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };
export function actualSize(nominal) {
  if (ACTUAL[nominal] != null) return ACTUAL[nominal];
  if (nominal > 12) return nominal - 0.75;
  return nominal;
}

// ---------- Roof ----------
// pitch = rise per 12" run. span = building width (outside of wall to outside).
export function roof({ pitch, span, overhang = 0, ridge = 1.5, length = 0 }) {
  const slope = pitch / 12;
  const angle = Math.atan(slope) * DEG;
  const run = span / 2 - ridge / 2; // common rafter run to ridge face
  const factor = Math.sqrt(1 + slope * slope);
  const rafter = run * factor; // line length, plate to ridge face
  const tail = overhang * factor; // overhang measured level
  const rise = run * slope;
  // hip/valley: unit run 16.97" per 12" common run
  const hipFactor = Math.sqrt(pitch * pitch + 288) / 12; // per inch of common run
  const hip = run * hipFactor;
  const roofArea = length ? (span + 2 * overhang) * (length + 2 * overhang) * factor : 0; // sq in
  return {
    angle, plumbCut: angle, seatCut: 90 - angle,
    run, rise, rafter, tail, rafterTotal: rafter + tail, hip, factor,
    roofArea, squares: roofArea / 144 / 100,
  };
}

export function pitchFromAngle(deg) { return Math.tan(deg / DEG) * 12; }

// ---------- Stairs ----------
// totalRise floor-to-floor; targetRise preferred riser; run = tread run (nosing to nosing).
export function stairs({ totalRise, targetRise = 7.25, run = 10.25, type = 'private', code = BC_STAIR_CODE }) {
  const lim = code[type];
  const maxRiseIn = lim.riseMax / 25.4;
  const minRiseIn = lim.riseMin / 25.4;
  let risers = Math.max(1, Math.round(totalRise / targetRise));
  if (totalRise / risers > maxRiseIn) risers = ceil(totalRise / maxRiseIn);
  if (totalRise / risers < minRiseIn && risers > 1) risers = Math.max(1, Math.floor(totalRise / minRiseIn));
  const riseEach = totalRise / risers;
  const treads = risers - 1;
  const totalRun = treads * run;
  const stringer = Math.hypot(totalRise, totalRun);
  const angle = Math.atan2(riseEach, run) * DEG;
  const riseMm = riseEach * 25.4;
  const runMm = run * 25.4;
  const issues = [];
  if (riseMm > lim.riseMax) issues.push(`Rise ${riseMm.toFixed(0)} mm is over the ${lim.riseMax} mm max`);
  if (riseMm < lim.riseMin) issues.push(`Rise ${riseMm.toFixed(0)} mm is under the ${lim.riseMin} mm min`);
  if (runMm < lim.runMin) issues.push(`Run ${runMm.toFixed(0)} mm is under the ${lim.runMin} mm min`);
  if (runMm > lim.runMax) issues.push(`Run ${runMm.toFixed(0)} mm is over the ${lim.runMax} mm max`);
  return { risers, treads, riseEach, totalRun, stringer, angle, issues, limits: lim, headroomIn: lim.headroom / 25.4 };
}

// ---------- Walls ----------
export function wall({ length, height = 96, spacing = 16, corners = 0, openings = [], plates = 3, plateStock = 192, wastePct = 0 }) {
  // studs on layout: one at start, then every spacing, plus end stud
  let studs = ceil(length / spacing) + 1;
  studs += corners * 2; // extra studs per corner / backing
  const headers = [];
  for (const o of openings) {
    // each opening: +2 king, +2 jack (layout studs inside opening roughly cancel kings)
    studs += 2;
    headers.push({ width: o.width, header: o.width + 3 }); // 1-1/2" bearing each side
  }
  const plateLf = (length * plates) / 12;
  const platePieces = ceil((length * plates) / plateStock);
  return {
    studs, studsWithWaste: ceil(withWaste(studs, wastePct)),
    plateLf, platePieces: ceil(withWaste(platePieces, wastePct)),
    headers, studLength: height - plates * 1.5,
  };
}

// ---------- Right triangle ----------
// Provide any two of a, b, c (or one side + angleA in degrees, angle opposite a).
export function rightTriangle({ a, b, c, angleA }) {
  const has = (v) => v != null && Number.isFinite(v) && v > 0;
  if (has(a) && has(b)) c = Math.hypot(a, b);
  else if (has(a) && has(c)) { if (c <= a) throw new Error('Hypotenuse must be longest'); b = Math.sqrt(c * c - a * a); }
  else if (has(b) && has(c)) { if (c <= b) throw new Error('Hypotenuse must be longest'); a = Math.sqrt(c * c - b * b); }
  else if (has(angleA) && (has(a) || has(b) || has(c))) {
    const t = angleA / DEG;
    if (has(c)) { a = c * Math.sin(t); b = c * Math.cos(t); }
    else if (has(a)) { c = a / Math.sin(t); b = a / Math.tan(t); }
    else { a = b * Math.tan(t); c = b / Math.cos(t); }
  } else throw new Error('Enter any two values');
  const A = Math.atan2(a, b) * DEG;
  return { a, b, c, angleA: A, angleB: 90 - A, area: (a * b) / 2, pitch: (a / b) * 12 };
}

export function squareCheck({ length, width }) {
  return { diagonal: Math.hypot(length, width) };
}

// ---------- Board feet ----------
// rows: [{ qty, t, w, lenFt }] nominal thickness/width in inches, length in feet.
export function boardFeet(rows, wastePct = 0) {
  let total = 0, lineal = 0, pieces = 0;
  const detail = rows.map((r) => {
    const bf = (r.qty * r.t * r.w * r.lenFt) / 12;
    total += bf; lineal += r.qty * r.lenFt; pieces += r.qty;
    return { ...r, bf, actualT: actualSize(r.t), actualW: actualSize(r.w) };
  });
  return { detail, total, totalWithWaste: withWaste(total, wastePct), lineal, pieces };
}

// ---------- Concrete ----------
// volumes in cubic inches -> report cu yd, m3, bags
const CUIN_PER_CUYD = 46656;
const CUIN_PER_M3 = 61023.7440947;
export function concreteVolume({ shape, length = 0, width = 0, depth = 0, diameter = 0, height = 0, qty = 1 }) {
  let v;
  if (shape === 'column') v = Math.PI * (diameter / 2) ** 2 * height;
  else v = length * width * depth;
  return v * qty;
}
export function concrete({ cuin, wastePct = 0, bagYieldCuFt = 0.5 }) {
  const v = withWaste(cuin, wastePct);
  return {
    cuin: v, cuyd: v / CUIN_PER_CUYD, m3: v / CUIN_PER_M3, cuft: v / 1728,
    bags: ceil(v / 1728 / bagYieldCuFt),
  };
}

// ---------- Drywall / sheathing ----------
export function sheets({ areaSqIn, sheetW = 48, sheetL = 96, wastePct = 0 }) {
  const sheetArea = sheetW * sheetL;
  const raw = areaSqIn / sheetArea;
  return { sheetsRaw: raw, sheets: ceil(withWaste(raw, wastePct)), areaSqFt: areaSqIn / 144 };
}
export function roomSurfaces({ length, width, height, includeCeiling = true, openingsSqIn = 0 }) {
  const walls = 2 * (length + width) * height;
  const ceilingA = includeCeiling ? length * width : 0;
  return { walls, ceiling: ceilingA, total: Math.max(0, walls + ceilingA - openingsSqIn) };
}

// ---------- Gravel / fill / topsoil ----------
// Typical loose bulk densities (t/m3). Approximate — confirm with your supplier.
export const BULK_DENSITY = {
  'Gravel / crushed rock': 1.6,
  'Sand': 1.6,
  'Road base (compacted)': 2.0,
  'Topsoil': 1.25,
  'Mulch / bark': 0.4,
};
export function fill({ length, width, depth, density = 1.6, wastePct = 0 }) {
  const cuin = withWaste(length * width * depth, wastePct);
  const m3 = cuin / CUIN_PER_M3;
  const tonnes = m3 * density;
  return { m3, cuyd: cuin / CUIN_PER_CUYD, tonnes, shortTons: tonnes * 1.10231131 };
}

// ---------- Area & perimeter ----------
// shapes: [{ type:'rect'|'tri'|'circle'|'trap', a, b, c, sign: 1|-1 }]
export function shapeArea(s) {
  switch (s.type) {
    case 'rect': return { area: s.a * s.b, perim: 2 * (s.a + s.b) };
    case 'tri': return { area: (s.a * s.b) / 2, perim: s.a + s.b + Math.hypot(s.a, s.b) }; // base x height (right tri perimeter)
    case 'circle': return { area: Math.PI * (s.a / 2) ** 2, perim: Math.PI * s.a };
    case 'trap': return { area: ((s.a + s.b) / 2) * s.c, perim: NaN };
    default: return { area: 0, perim: 0 };
  }
}
export function areaTotal(shapes) {
  let area = 0, perim = 0;
  for (const s of shapes) {
    const r = shapeArea(s);
    area += (s.sign || 1) * r.area;
    if ((s.sign || 1) > 0) perim += r.perim;
  }
  return { areaSqIn: area, sqft: area / 144, m2: area * 0.00064516, perimIn: perim };
}

// ---------- Decking ----------
// boards run along `length`; rows stack across `width`; joists span `width`.
export function deck({ length, width, boardW = 5.5, gap = 0.1875, boardLenFt = 16, joistSpacing = 16, wastePct = 0 }) {
  const rows = ceil(width / (boardW + gap));
  const lineal = (rows * length) / 12;
  const boardsPerRow = ceil(length / (boardLenFt * 12));
  const boards = ceil(withWaste(rows * boardsPerRow, wastePct));
  const joists = ceil(length / joistSpacing) + 1;
  const screws = rows * joists * 2;
  return { rows, lineal, boards, joists, joistLength: width, screws, areaSqFt: (length * width) / 144 };
}

// ---------- Paint ----------
// coverage: sq ft per can (default 1 gal / 3.78 L can ~ 350–400 sq ft per coat)
export function paint({ areaSqFt, coats = 2, coveragePerCan = 375, canLitres = 3.78, wastePct = 0 }) {
  const need = withWaste(areaSqFt * coats, wastePct);
  const cans = need / coveragePerCan;
  return { paintArea: need, cans: ceil(cans), cansRaw: cans, litres: cans * canLitres };
}

// ---------- Flooring / tile ----------
export function flooring({ areaSqFt, boxSqFt = 20, tileW = 0, tileL = 0, wastePct = 0 }) {
  const need = withWaste(areaSqFt, wastePct);
  const out = { needSqFt: need, boxes: ceil(need / boxSqFt) };
  if (tileW > 0 && tileL > 0) out.tiles = ceil((need * 144) / (tileW * tileL));
  return out;
}
