// Build export files (CSV, XLSX, DOCX, PDF) from saved jobs — entirely on-device.
// Open the files with Google Sheets / Google Docs (or Excel / Word) — no sign-in needed.
import { zip, xmlEscape as x } from './zip.js';

const dateStr = (ts) => new Date(ts).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
const pairs = (list) => (list || []).map(([k, v]) => `${k}: ${v}`).join('; ');

export function entryRows(job, entries) {
  return entries.map((e) => ({
    date: dateStr(e.ts),
    job: job.name,
    screen: e.screen,
    title: e.title || '',
    calc: e.expression || pairs(e.inputs),
    result: e.result || pairs(e.outputs),
    note: e.note || '',
  }));
}

// ---------- CSV ----------
export function toCSV(job, entries) {
  const head = ['Date', 'Job', 'Screen', 'Title', 'Calculation / inputs', 'Result', 'Note'];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = entryRows(job, entries).map((r) => [r.date, r.job, r.screen, r.title, r.calc, r.result, r.note]);
  return '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

// ---------- XLSX ----------
function colName(i) {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
function sheetXml(rows, widths) {
  const body = rows.map((row, r) => {
    const cells = row.map((v, c) => {
      const ref = `${colName(c)}${r + 1}`;
      const style = r === 0 ? ' s="1"' : '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
      if (v == null || v === '') return '';
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const cols = widths ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${body}</sheetData></worksheet>`;
}

export function toXLSX(job, entries) {
  const summary = [['Date', 'Job', 'Screen', 'Title', 'Calculation / inputs', 'Result', 'Note'],
    ...entryRows(job, entries).map((r) => [r.date, r.job, r.screen, r.title, r.calc, r.result, r.note])];
  const details = [['Entry #', 'Date', 'Title', 'Type', 'Item', 'Value', 'Number']];
  entries.forEach((e, i) => {
    const t = e.title || e.screen;
    if (e.expression) details.push([i + 1, dateStr(e.ts), t, 'Calculation', e.expression, e.result, num(e.resultValue)]);
    for (const [k, v, n] of e.inputs || []) details.push([i + 1, dateStr(e.ts), t, 'Input', k, v, num(n)]);
    for (const [k, v, n] of e.outputs || []) details.push([i + 1, dateStr(e.ts), t, 'Result', k, v, num(n)]);
    if (e.note) details.push([i + 1, dateStr(e.ts), t, 'Note', 'Note', e.note, null]);
  });
  const sheets = [
    { name: 'Summary', xml: sheetXml(summary, [20, 18, 13, 22, 50, 40, 30]) },
    { name: 'Details', xml: sheetXml(details, [8, 20, 22, 12, 30, 28, 14]) },
  ];
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml })),
  ];
  return zip(files);
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------- DOCX ----------
export function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const p = (text, opts = {}) => {
  const style = opts.style ? `<w:pPr><w:pStyle w:val="${opts.style}"/></w:pPr>` : '';
  const rpr = opts.bold || opts.size || opts.color
    ? `<w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.color ? `<w:color w:val="${opts.color}"/>` : ''}${opts.size ? `<w:sz w:val="${opts.size}"/>` : ''}</w:rPr>` : '';
  return `<w:p>${style}<w:r>${rpr}<w:t xml:space="preserve">${x(text)}</w:t></w:r></w:p>`;
};
const cell = (text, bold, w) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${x(text)}</w:t></w:r></w:p></w:tc>`;
function table(rows) {
  const border = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="BBBBBB"/>`).join('') + '</w:tblBorders>';
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>${border}</w:tblPr><w:tblGrid><w:gridCol w:w="4000"/><w:gridCol w:w="5000"/></w:tblGrid>${
    rows.map(([k, v], i) => `<w:tr>${cell(k, i === 0, 4000)}${cell(v, i === 0, 5000)}</w:tr>`).join('')}</w:tbl>`;
}
function imageXml(rid, idx, wPx, hPx, name) {
  const maxW = 6 * 914400; // 6 inches
  const cx = maxW;
  const cy = Math.round((maxW * hPx) / wPx);
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${idx}" name="${x(name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idx}" name="${x(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

export function toDOCX(job, entries, sketches = []) {
  let body = p(job.name, { style: 'Title' });
  body += p(`Exported ${dateStr(Date.now())} — ${entries.length} calculation(s), ${sketches.length} sketch(es)`, { color: '666666' });
  entries.forEach((e, i) => {
    body += p(`${i + 1}. ${e.title || e.screen}`, { style: 'Heading2' });
    body += p(`${e.screen} · ${dateStr(e.ts)}`, { color: '666666', size: 18 });
    const rows = [['Item', 'Value']];
    if (e.expression) rows.push(['Calculation', e.expression], ['Result', e.result]);
    for (const [k, v] of e.inputs || []) rows.push([k, v]);
    for (const [k, v] of e.outputs || []) rows.push([`→ ${k}`, v]);
    body += table(rows);
    if (e.note) body += p(`Note: ${e.note}`);
  });
  const media = [];
  if (sketches.length) body += p('Sketches', { style: 'Heading1' });
  sketches.forEach((s, i) => {
    if (!s.png) return;
    const rid = `rIdImg${i + 1}`;
    media.push({ rid, name: `word/media/sketch${i + 1}.png`, data: dataUrlToBytes(s.png), target: `media/sketch${i + 1}.png` });
    body += p(s.name || `Sketch ${i + 1}`, { style: 'Heading2' });
    body += imageXml(rid, i + 1, s.w || 1200, s.h || 900, s.name || `Sketch ${i + 1}`);
  });

  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="360"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>`;
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.target}"/>`).join('')}</Relationships>` },
    { name: 'word/document.xml', data: doc },
    { name: 'word/styles.xml', data: styles },
    ...media.map((m) => ({ name: m.name, data: m.data })),
  ];
  return zip(files);
}

// ---------- PDF (single page image, e.g. a sketch) ----------
// jpegBytes: Uint8Array of a baseline JPEG; w/h in pixels. Page is Letter, image fit with margins.
export function imageToPDF(jpegBytes, w, h, title = 'Sketch') {
  const pageW = 612, pageH = 792, margin = 36;
  const landscape = w > h;
  const PW = landscape ? pageH : pageW;
  const PH = landscape ? pageW : pageH;
  const scale = Math.min((PW - 2 * margin) / w, (PH - 2 * margin - 24) / h);
  const dw = w * scale, dh = h * scale;
  const dx = (PW - dw) / 2, dy = margin;
  const enc = new TextEncoder();
  const safeTitle = title.replace(/[()\\]/g, '').replace(/[^\x20-\x7E]/g, '?');
  const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im0 Do Q BT /F1 12 Tf ${margin} ${PH - margin + 4 - 12} Td (${safeTitle}) Tj ET`;
  const objs = [];
  objs[1] = enc.encode('<< /Type /Catalog /Pages 2 0 R >>');
  objs[2] = enc.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs[3] = enc.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> /Font << /F1 6 0 R >> >> /Contents 5 0 R >>`);
  const imgHead = enc.encode(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  const imgTail = enc.encode('\nendstream');
  objs[4] = concat(imgHead, jpegBytes, imgTail);
  objs[5] = enc.encode(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objs[6] = enc.encode('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const parts = [enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  const offsets = [];
  let pos = parts[0].length;
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = pos;
    const head = enc.encode(`${i} 0 obj\n`);
    const tail = enc.encode('\nendobj\n');
    parts.push(head, objs[i], tail);
    pos += head.length + objs[i].length + tail.length;
  }
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`;
  parts.push(enc.encode(xref));
  return concat(...parts);
}

function concat(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
