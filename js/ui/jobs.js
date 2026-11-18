// Jobs: saved calculations and sketches grouped by job, with on-device exports.
import * as store from '../store.js';
import { toCSV, toXLSX, toDOCX } from '../export/documents.js';
import { h, toast, sheet, promptBox, confirmBox, downloadBytes, shareFile, safeName } from './common.js';
import { sketchToPdfBytes } from './sketch.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const dt = (ts) => new Date(ts).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });

export function initJobs(root, { openSketch, onActiveChange }) {
  const head = h('div', { class: 'actions' },
    h('button', { onclick: async () => { const n = await promptBox('New job', { placeholder: 'e.g. Smith reno', voice: true, okLabel: 'Create' }); if (n && n.trim()) { const j = await store.createJob(n); setActive(j.id); render(); } } }, '＋ New job'),
    h('span', { class: 'sp' }),
    h('span', { class: 'muted small', style: 'align-self:center' }, '🔒 Stored only on this device'));
  const list = h('div', { class: 'list' });
  root.append(head, list);
  let openId = null;

  function setActive(id) {
    if (id) localStorage.setItem('activeJob', id); else localStorage.removeItem('activeJob');
    onActiveChange();
  }

  async function render() {
    const jobs = await store.listJobs();
    const active = localStorage.getItem('activeJob');
    list.innerHTML = '';
    if (!jobs.length) {
      list.append(h('div', { class: 'empty' }, h('div', { style: 'font-size:2.4rem' }, '🗂'),
        h('p', {}, 'No jobs yet.'), h('p', { class: 'small' }, 'Create a job, then use 💾 Save on any calculator or sketch. Each job exports to Google Sheets (.xlsx / .csv) or Google Docs (.docx).')));
      return;
    }
    for (const j of jobs) {
      const { entries, sketches } = await store.jobContents(j.id);
      const isOpen = openId === j.id;
      const card = h('div', { class: `card ${j.id === active ? 'active' : ''}` });
      const title = h('div', { style: 'display:flex;gap:8px;align-items:center;cursor:pointer' },
        h('div', { style: 'flex:1' }, h('h3', {}, j.name, j.id === active ? h('span', { class: 'muted small' }, '  · active') : ''),
          h('div', { class: 'meta' }, `${entries.length} calculation${entries.length === 1 ? '' : 's'} · ${sketches.length} sketch${sketches.length === 1 ? '' : 'es'} · updated ${dt(j.updated)}`)),
        h('span', { class: 'muted' }, isOpen ? '▴' : '▾'));
      title.addEventListener('click', () => { openId = isOpen ? null : j.id; render(); });
      card.append(title);
      if (isOpen) {
        card.append(h('div', { class: 'row' },
          j.id !== active ? h('button', { class: 'btn small', onclick: () => { setActive(j.id); render(); } }, 'Make active') : null,
          h('button', { class: 'btn small primary', onclick: () => exportJob(j, entries, sketches) }, '⇪ Export'),
          h('button', { class: 'btn small', onclick: async () => { const n = await promptBox('Rename job', { value: j.name, okLabel: 'Rename' }); if (n && n.trim()) { j.name = n.trim(); await store.put('jobs', j); render(); onActiveChange(); } } }, 'Rename'),
          h('button', { class: 'btn small danger', onclick: async () => {
            if (await confirmBox('Delete job', `Delete "${j.name}" with ${entries.length} calculations and ${sketches.length} sketches? This can't be undone.`, { okLabel: 'Delete', danger: true })) {
              await store.deleteJob(j.id); if (active === j.id) setActive(null); render();
            }
          } }, 'Delete')));
        if (sketches.length) {
          const th = h('div', { class: 'thumbs' });
          for (const s of sketches) {
            const fig = h('figure', {}, h('img', { src: s.png, alt: s.name }), h('figcaption', {}, s.name));
            fig.addEventListener('click', () => sketchMenu(s));
            th.append(fig);
          }
          card.append(th);
        }
        for (const e of entries.slice().reverse()) {
          const body = e.expression
            ? h('div', { class: 'ev' }, `${e.expression} = ${e.result}`)
            : h('div', { class: 'ev' }, ...(e.outputs || []).slice(0, 6).map(([k, v]) => h('div', {}, h('span', { class: 'muted' }, `${k}: `), v)));
          const del = h('button', { class: 'icon-btn', 'aria-label': 'Delete entry', style: 'width:32px;height:32px;font-size:.9rem' }, '✕');
          del.addEventListener('click', async () => { if (await confirmBox('Delete entry', `Delete "${e.title}"?`, { okLabel: 'Delete', danger: true })) { await store.del('entries', e.id); render(); } });
          card.append(h('div', { class: 'entry' },
            h('div', { class: 'et' }, h('b', {}, e.title || e.screen), h('span', { style: 'display:flex;gap:6px;align-items:center' }, h('span', { class: 'muted small' }, `${e.screen} · ${dt(e.ts)}`), del)),
            body, e.note ? h('div', { class: 'en' }, `📝 ${e.note}`) : null));
        }
        if (!entries.length && !sketches.length) card.append(h('p', { class: 'muted small' }, 'Nothing saved here yet. Make this the active job and tap 💾 Save on any calculator.'));
      }
      list.append(card);
    }
  }

  function sketchMenu(s) {
    sheet(s.name, h('img', { src: s.png, alt: s.name, style: 'width:100%;background:#fff;border-radius:10px' }), {
      actions: [
        { label: 'Delete', danger: true, onClick: async () => { if (await confirmBox('Delete sketch', `Delete "${s.name}"?`, { okLabel: 'Delete', danger: true })) { await store.del('sketches', s.id); render(); } } },
        { label: 'PDF', onClick: async () => downloadBytes(await sketchToPdfBytes(s), `${safeName(s.name)}.pdf`, 'application/pdf') },
        { label: 'Open', primary: true, onClick: () => openSketch(s) },
      ],
    });
  }

  function exportJob(job, entries, sketches) {
    const base = safeName(job.name);
    const make = {
      xlsx: () => [toXLSX(job, entries), `${base}.xlsx`, XLSX],
      csv: () => [new TextEncoder().encode(toCSV(job, entries)), `${base}.csv`, 'text/csv'],
      docx: () => [toDOCX(job, entries, sketches), `${base}.docx`, DOCX],
    };
    const choose = h('div', { class: 'seg' });
    let kind = 'xlsx';
    [['xlsx', 'Sheets / Excel'], ['csv', 'CSV'], ['docx', 'Docs / Word']].forEach(([k, t]) => {
      const b = h('button', { class: k === kind ? 'on' : '' }, t);
      b.addEventListener('click', () => { kind = k; [...choose.children].forEach((c) => c.classList.toggle('on', c === b)); });
      choose.append(b);
    });
    sheet(`Export "${job.name}"`, h('div', {},
      choose,
      h('p', { class: 'note' }, 'The file is built on this phone — nothing is uploaded. To get it into Google: tap Share… and pick Drive, or download it and open it from Drive. Google Sheets opens .xlsx/.csv; Google Docs opens .docx (sketches are included in the Docs file).')), {
      actions: [
        { label: 'Download', onClick: () => { const [b, n, m] = make[kind](); downloadBytes(b, n, m); toast(`Saved ${n}`); } },
        { label: 'Share…', primary: true, onClick: () => { const [b, n, m] = make[kind](); shareFile(b, n, m); } },
      ],
    });
  }

  document.addEventListener('jobs-changed', () => { render(); onActiveChange(); });
  render();
  return { render };
}
