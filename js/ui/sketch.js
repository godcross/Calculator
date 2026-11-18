// Stylus sketch pad: pressure pen, eraser, straight lines with angle/grid snap,
// dimension lines with auto length from grid scale, text labels, PNG/PDF export, saved to jobs.
import * as store from '../store.js';
import { formatFtIn, formatMetricLength } from '../engine/format.js';
import { imageToPDF, dataUrlToBytes } from '../export/documents.js';
import { h, toast, sheet, promptBox, confirmBox, downloadBytes, shareFile, safeName } from './common.js';

const GRID = 40; // doc px per grid square
const SCALES = [
  ['1', '1"', 1], ['6', '6"', 6], ['12', "1'", 12], ['24', "2'", 24], ['60', "5'", 60], ['120', "10'", 120],
  ['m0.5', '0.5 m', 500 / 25.4], ['m1', '1 m', 1000 / 25.4],
];

export function initSketch(root) {
  let tool = 'pen';
  let color = '#111111';
  let width = 3;
  let grid = true;
  let snap = true;
  let scaleKey = '12';
  let objs = [];
  let redo = [];
  let doc = null; // { w, h }
  let current = { id: null, name: '', jobId: null };
  let penSeen = false;

  const wrap = h('div', { class: 'canvas-wrap' });
  const canvas = h('canvas', { 'aria-label': 'Sketch canvas' });
  const status = h('div', { class: 'sketch-status' });
  wrap.append(canvas, status);

  const btn = (label, title, onclick, extra = {}) => h('button', { title, 'aria-label': title, onclick, ...extra }, label);
  const toolBtns = {};
  const tools = [['pen', '✎', 'Pen (pressure)'], ['line', '╱', 'Straight line'], ['dim', '↔', 'Dimension'], ['text', 'T', 'Text label'], ['erase', '⌫', 'Eraser']];
  const bar = h('div', { class: 'sketch-tools', role: 'toolbar' });
  for (const [id, label, title] of tools) {
    const b = btn(label, title, () => setTool(id));
    toolBtns[id] = b;
    bar.append(b);
  }
  bar.append(h('span', { class: 'sep' }));
  for (const c of ['#111111', '#d62828', '#1d4ed8', '#15803d']) {
    const s = h('button', { class: 'swatch', style: `background:${c}`, 'aria-label': `Colour ${c}`, onclick: () => { color = c; refreshBar(); } });
    s.dataset.c = c;
    bar.append(s);
  }
  const widthBtn = btn('●', 'Line weight', () => { width = width === 2 ? 3 : width === 3 ? 6 : 2; refreshBar(); });
  bar.append(widthBtn, h('span', { class: 'sep' }));
  const gridBtn = btn('#', 'Grid', () => { grid = !grid; refreshBar(); draw(); });
  const snapBtn = btn('⌖', 'Snap to grid and angles', () => { snap = !snap; refreshBar(); });
  const scaleSel = h('select', { 'aria-label': 'Grid scale', style: 'width:auto;padding:6px 8px;border-radius:10px;flex:none' },
    ...SCALES.map(([k, l]) => h('option', { value: k, selected: k === scaleKey }, `□ = ${l}`)));
  scaleSel.addEventListener('change', () => { scaleKey = scaleSel.value; updateStatus(); });
  bar.append(gridBtn, snapBtn, scaleSel, h('span', { class: 'sep' }),
    btn('↶', 'Undo', () => { if (objs.length) { redo.push(objs.pop()); draw(); } }),
    btn('↷', 'Redo', () => { if (redo.length) { objs.push(redo.pop()); draw(); } }),
    h('span', { class: 'sep' }),
    btn('💾', 'Save to job', () => saveDialog()),
    btn('⇪', 'Export PNG / PDF', () => exportDialog()),
    btn('＋', 'New sketch', async () => { if (objs.length && !(await confirmBox('New sketch', 'Start a new blank sketch? Unsaved changes will be lost.', { okLabel: 'New sketch' }))) return; newSketch(); }));

  function refreshBar() {
    for (const [id, b] of Object.entries(toolBtns)) b.classList.toggle('on', id === tool);
    bar.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s.dataset.c === color));
    widthBtn.style.fontSize = `${width * 0.25 + 0.6}rem`;
    gridBtn.classList.toggle('on', grid);
    snapBtn.classList.toggle('on', snap);
    updateStatus();
  }
  function setTool(t) { tool = t; refreshBar(); }
  function updateStatus() {
    const sc = SCALES.find((s) => s[0] === scaleKey);
    status.textContent = `${current.name || 'Untitled sketch'} · grid □ = ${sc[1]}${penSeen ? ' · pen mode (palm rejection on)' : ''}`;
  }

  // ---------- geometry / view ----------
  let view = { s: 1, ox: 0, oy: 0 };
  function layout() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    if (!doc) doc = { w: Math.round(r.width * 2), h: Math.round(r.height * 2) };
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const s = Math.min(r.width / doc.w, r.height / doc.h);
    view = { s, ox: (r.width - doc.w * s) / 2, oy: (r.height - doc.h * s) / 2, dpr };
    draw();
  }
  const toDoc = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left - view.ox) / view.s, (e.clientY - r.top - view.oy) / view.s];
  };

  function render(g, scale, offX, offY, { forExport = false } = {}) {
    g.save();
    g.translate(offX, offY);
    g.scale(scale, scale);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, doc.w, doc.h);
    if (grid) {
      g.lineWidth = 1 / scale;
      for (let x = 0; x <= doc.w; x += GRID) { g.strokeStyle = (x / GRID) % 5 === 0 ? '#c9d3dc' : '#e7edf2'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, doc.h); g.stroke(); }
      for (let y = 0; y <= doc.h; y += GRID) { g.strokeStyle = (y / GRID) % 5 === 0 ? '#c9d3dc' : '#e7edf2'; g.beginPath(); g.moveTo(0, y); g.lineTo(doc.w, y); g.stroke(); }
    }
    for (const o of objs) drawObj(g, o);
    if (preview) drawObj(g, preview);
    g.restore();
    void forExport;
  }
  function drawObj(g, o) {
    g.strokeStyle = o.color; g.fillStyle = o.color; g.lineCap = 'round'; g.lineJoin = 'round';
    if (o.t === 'pen') {
      const p = o.pts;
      if (p.length === 1) { g.beginPath(); g.arc(p[0][0], p[0][1], o.w * (0.35 + 1.3 * p[0][2]), 0, Math.PI * 2); g.fill(); return; }
      for (let i = 1; i < p.length; i++) {
        g.lineWidth = o.w * 2 * (0.35 + 1.3 * (p[i - 1][2] + p[i][2]) / 2);
        g.beginPath(); g.moveTo(p[i - 1][0], p[i - 1][1]); g.lineTo(p[i][0], p[i][1]); g.stroke();
      }
    } else if (o.t === 'line') {
      g.lineWidth = o.w * 2; g.beginPath(); g.moveTo(...o.a); g.lineTo(...o.b); g.stroke();
    } else if (o.t === 'dim') {
      const [ax, ay] = o.a, [bx, by] = o.b;
      const ang = Math.atan2(by - ay, bx - ax);
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      // end ticks + arrowheads
      for (const [px, py, dir] of [[ax, ay, 1], [bx, by, -1]]) {
        g.beginPath(); g.moveTo(px + nx * 12, py + ny * 12); g.lineTo(px - nx * 12, py - ny * 12); g.stroke();
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + dir * 14 * Math.cos(ang) + nx * 6, py + dir * 14 * Math.sin(ang) + ny * 6);
        g.lineTo(px + dir * 14 * Math.cos(ang) - nx * 6, py + dir * 14 * Math.sin(ang) - ny * 6);
        g.closePath(); g.fill();
      }
      if (o.label) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        let a2 = ang;
        if (a2 > Math.PI / 2 || a2 < -Math.PI / 2) a2 += Math.PI;
        g.save(); g.translate(mx, my); g.rotate(a2);
        g.font = 'bold 26px system-ui, sans-serif';
        const tw = g.measureText(o.label).width;
        g.fillStyle = '#ffffff'; g.fillRect(-tw / 2 - 6, -34, tw + 12, 30);
        g.fillStyle = o.color; g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.fillText(o.label, 0, -8);
        g.restore();
      }
    } else if (o.t === 'text') {
      g.font = `${o.size || 30}px system-ui, sans-serif`; g.textBaseline = 'middle';
      g.fillText(o.text, o.x, o.y);
    }
  }
  function draw() {
    const g = canvas.getContext('2d');
    g.setTransform(view.dpr || 1, 0, 0, view.dpr || 1, 0, 0);
    g.fillStyle = '#9aa3aa';
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (doc) render(g, view.s, view.ox, view.oy);
  }

  // ---------- snapping ----------
  function snapPoint([x, y]) {
    if (!snap || !grid) return [x, y];
    const gx = Math.round(x / GRID) * GRID, gy = Math.round(y / GRID) * GRID;
    return Math.hypot(gx - x, gy - y) < 14 ? [gx, gy] : [x, y];
  }
  function snapAngle(a, b) {
    if (!snap) return b;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const step = Math.PI / 12; // 15°
    const snapped = Math.round(ang / step) * step;
    if (Math.abs(snapped - ang) < (5 * Math.PI) / 180) return snapPoint([a[0] + len * Math.cos(snapped), a[1] + len * Math.sin(snapped)]);
    return snapPoint(b);
  }
  function lengthLabel(a, b) {
    const sc = SCALES.find((s) => s[0] === scaleKey);
    const inches = (Math.hypot(b[0] - a[0], b[1] - a[1]) / GRID) * sc[2];
    return scaleKey.startsWith('m') || store.settings().units === 'metric' ? formatMetricLength(inches) : formatFtIn(inches, 16).replace('≈ ', '');
  }

  // ---------- input ----------
  let drawing = null;
  let preview = null;
  let activePointer = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') { if (!penSeen) { penSeen = true; updateStatus(); } }
    if (penSeen && e.pointerType === 'touch') return; // palm rejection once a stylus is used
    if (activePointer != null) return;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = toDoc(e);
    const pr = e.pointerType === 'pen' ? Math.max(0.15, e.pressure || 0.5) : 0.5;
    if (tool === 'pen') {
      drawing = { t: 'pen', color, w: width, pts: [[p[0], p[1], pr]] };
      preview = drawing;
    } else if (tool === 'line' || tool === 'dim') {
      const a = snapPoint(p);
      drawing = { t: tool, color, w: width, a, b: a };
      preview = drawing;
    } else if (tool === 'erase') {
      eraseAt(p);
    } else if (tool === 'text') {
      activePointer = null;
      addText(p);
    }
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (tool === 'pen' && drawing) {
      for (const ev of events) {
        const p = toDoc(ev);
        const pr = ev.pointerType === 'pen' ? Math.max(0.15, ev.pressure || 0.5) : 0.5;
        const last = drawing.pts[drawing.pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.2) drawing.pts.push([p[0], p[1], pr]);
      }
      draw();
    } else if ((tool === 'line' || tool === 'dim') && drawing) {
      drawing.b = snapAngle(drawing.a, toDoc(e));
      if (tool === 'dim') drawing.label = lengthLabel(drawing.a, drawing.b);
      draw();
    } else if (tool === 'erase') {
      for (const ev of events) eraseAt(toDoc(ev));
    }
  });
  const finish = async (e) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    const d = drawing;
    drawing = null; preview = null;
    if (!d) { draw(); return; }
    if (d.t === 'pen') { objs.push(d); redo = []; }
    if ((d.t === 'line' || d.t === 'dim') && Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) > 8) {
      if (d.t === 'dim') {
        const label = await promptBox('Dimension label', { value: d.label, voice: true, okLabel: 'Place' });
        if (label === null) { draw(); return; }
        d.label = label;
      }
      objs.push(d); redo = [];
    }
    draw();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  function distToSeg(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  function eraseAt(p) {
    const r = 16;
    const before = objs.length;
    objs = objs.filter((o) => {
      if (o.t === 'pen') return !o.pts.some((q, i) => (i ? distToSeg(p, o.pts[i - 1], q) : Math.hypot(p[0] - q[0], p[1] - q[1])) < r);
      if (o.t === 'line' || o.t === 'dim') return distToSeg(p, o.a, o.b) > r;
      if (o.t === 'text') return !(p[0] > o.x - r && p[0] < o.x + o.text.length * (o.size || 30) * 0.55 + r && Math.abs(p[1] - o.y) < (o.size || 30) / 2 + r);
      return true;
    });
    if (objs.length !== before) { redo = []; draw(); }
  }
  async function addText(p) {
    const text = await promptBox('Text label', { placeholder: 'e.g. Ledger 2×10 @ 16" O.C.', voice: true, okLabel: 'Place' });
    if (text && text.trim()) { objs.push({ t: 'text', color, x: p[0], y: p[1], text: text.trim(), size: 26 + width * 4 }); redo = []; draw(); }
  }

  // ---------- save / load / export ----------
  function renderImage(type = 'image/png', maxW = 2000) {
    const s = Math.min(1, maxW / doc.w);
    const c = document.createElement('canvas');
    c.width = Math.round(doc.w * s); c.height = Math.round(doc.h * s);
    render(c.getContext('2d'), s, 0, 0, { forExport: true });
    return { url: c.toDataURL(type, 0.92), w: c.width, h: c.height };
  }
  async function saveDialog() {
    if (!objs.length) return toast('Draw something first');
    const jobs = await store.listJobs();
    const active = current.jobId || localStorage.getItem('activeJob');
    const sel = h('select', {}, ...jobs.map((j) => h('option', { value: j.id, selected: j.id === active }, j.name)), h('option', { value: '__new' }, '+ New job…'));
    const newName = h('input', { type: 'text', placeholder: 'New job name', class: jobs.length ? 'hidden' : '' });
    if (!jobs.length) sel.value = '__new';
    sel.addEventListener('change', () => newName.classList.toggle('hidden', sel.value !== '__new'));
    const name = h('input', { type: 'text', value: current.name || '', placeholder: 'Sketch name (e.g. Deck framing plan)' });
    sheet('Save sketch', h('div', {}, h('label', { class: 'lbl' }, 'Job'), sel, newName, h('label', { class: 'lbl' }, 'Name'),
      h('div', { class: 'field-row' }, name, h('button', { class: 'icon-btn mic-inline', 'aria-label': 'Dictate name', onclick: () => window.__voice?.dictateInto(name) }, '🎙'))), {
      actions: [
        { label: 'Cancel' },
        ...(current.id ? [{ label: 'Save as new', onClick: () => doSave(sel, newName, name, true) }] : []),
        { label: current.id ? 'Update' : 'Save', primary: true, onClick: () => doSave(sel, newName, name, false) },
      ],
    });
  }
  async function doSave(sel, newName, name, asNew) {
    let jobId = sel.value;
    if (jobId === '__new') {
      if (!newName.value.trim()) { toast('Give the job a name'); return true; }
      jobId = (await store.createJob(newName.value)).id;
    }
    const img = renderImage('image/png', 1600);
    const rec = {
      id: !asNew && current.id ? current.id : store.uid(),
      jobId, name: name.value.trim() || 'Sketch', ts: Date.now(),
      doc, objs, grid, scaleKey, png: img.url, w: img.w, h: img.h,
    };
    await store.put('sketches', rec);
    await store.touchJob(jobId);
    localStorage.setItem('activeJob', jobId);
    current = { id: rec.id, name: rec.name, jobId };
    updateStatus();
    toast('Sketch saved');
    document.dispatchEvent(new CustomEvent('jobs-changed'));
    return false;
  }
  function exportDialog() {
    if (!objs.length) return toast('Draw something first');
    const base = safeName(current.name || 'sketch');
    sheet('Export sketch', h('p', { class: 'muted' }, 'Files are made on this phone. Share sends them to any app you choose (Drive, email, messages).'), {
      actions: [
        { label: 'PNG', onClick: () => { const im = renderImage('image/png'); downloadBytes(dataUrlToBytes(im.url), `${base}.png`, 'image/png'); } },
        { label: 'PDF', onClick: () => { const im = renderImage('image/jpeg'); downloadBytes(imageToPDF(dataUrlToBytes(im.url), im.w, im.h, current.name || 'Sketch'), `${base}.pdf`, 'application/pdf'); } },
        { label: 'Share…', primary: true, onClick: () => { const im = renderImage('image/png'); shareFile(dataUrlToBytes(im.url), `${base}.png`, 'image/png'); } },
      ],
    });
  }
  function newSketch() {
    objs = []; redo = []; doc = null; current = { id: null, name: '', jobId: null };
    layout(); updateStatus();
  }
  function load(rec) {
    doc = rec.doc; objs = rec.objs || []; redo = []; grid = rec.grid ?? true; scaleKey = rec.scaleKey || '12';
    scaleSel.value = scaleKey;
    current = { id: rec.id, name: rec.name, jobId: rec.jobId };
    refreshBar(); layout();
  }

  root.append(bar, wrap);
  refreshBar();
  new ResizeObserver(() => layout()).observe(wrap);
  return { load, onShow: () => layout(), sketchPdf: null };
}

export function sketchToPdfBytes(rec) {
  // rec.png is PNG; re-encode as JPEG for the PDF
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
      resolve(imageToPDF(dataUrlToBytes(c.toDataURL('image/jpeg', 0.92)), c.width, c.height, rec.name || 'Sketch'));
    };
    img.src = rec.png;
  });
}
