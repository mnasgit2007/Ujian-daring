import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';
import { SHEETS, appendRows, readRows } from '../api/_lib/store.js';

export const MAX_SOAL_IMPORT = 80;

const HEADER_ALIASES = Object.freeze({
  soalid: 'SoalID', questionid: 'SoalID', idsoal: 'SoalID',
  pertanyaan: 'Pertanyaan', question: 'Pertanyaan', soal: 'Pertanyaan',
  a: 'A', opsiA: 'A', optiona: 'A', b: 'B', opsiB: 'B', optionb: 'B',
  c: 'C', opsiC: 'C', optionc: 'C', d: 'D', opsiD: 'D', optiond: 'D',
  kunci: 'Kunci', key: 'Kunci', answer: 'Kunci', bobot: 'Bobot', weight: 'Bobot',
  drivefileid: 'DriveFileId', imagefileid: 'DriveFileId', gambar: 'DriveFileId'
});
const REQUIRED = ['SoalID', 'Pertanyaan', 'A', 'B', 'C', 'D', 'Kunci', 'Bobot'];
const text = value => String(value ?? '').trim();
const cleanHeader = value => text(value).replace(/[\s_-]+/g, '').toLowerCase();

export function parseQuestionRows(matrix, examId, sourceName = 'file') {
  if (!Array.isArray(matrix) || matrix.length < 2) throw new Error(`${sourceName}: file harus memiliki header dan minimal satu soal.`);
  const columns = new Map();
  matrix[0].map(cleanHeader).forEach((header, index) => {
    const field = HEADER_ALIASES[header];
    if (field && !columns.has(field)) columns.set(field, index);
  });
  const missing = REQUIRED.filter(field => !columns.has(field));
  if (missing.length) throw new Error(`${sourceName}: kolom wajib tidak ditemukan: ${missing.join(', ')}.`);

  const seen = new Set();
  const rows = [];
  matrix.slice(1).forEach((raw, offset) => {
    const line = offset + 2;
    if (!raw.some(value => text(value))) return;
    const valueOf = field => text(raw[columns.get(field)]);
    const id = valueOf('SoalID');
    const key = valueOf('Kunci').toUpperCase();
    const weight = Number(valueOf('Bobot'));
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(id)) throw new Error(`${sourceName} baris ${line}: SoalID tidak valid.`);
    if (seen.has(id)) throw new Error(`${sourceName} baris ${line}: SoalID duplikat ${id}.`);
    if (!valueOf('Pertanyaan') || !valueOf('A') || !valueOf('B') || !valueOf('C') || !valueOf('D')) throw new Error(`${sourceName} baris ${line}: pertanyaan dan pilihan A-D wajib diisi.`);
    if (!['A', 'B', 'C', 'D'].includes(key)) throw new Error(`${sourceName} baris ${line}: Kunci harus A, B, C, atau D.`);
    if (!Number.isFinite(weight) || weight <= 0) throw new Error(`${sourceName} baris ${line}: Bobot harus lebih besar dari 0.`);
    seen.add(id);
    rows.push([String(examId), id, valueOf('Pertanyaan'), valueOf('A'), valueOf('B'), valueOf('C'), valueOf('D'), key, weight, valueOf('DriveFileId')]);
  });
  if (!rows.length) throw new Error(`${sourceName}: tidak ada baris soal yang dapat diimpor.`);
  if (rows.length > MAX_SOAL_IMPORT) throw new Error(`${sourceName}: jumlah soal melebihi batas ${MAX_SOAL_IMPORT}.`);
  return rows;
}

export function readQuestionFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) throw new Error(`File tidak ditemukan: ${resolved}`);
  const workbook = XLSX.readFile(resolved, { cellDates: false, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('File tidak memiliki worksheet.');
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
}

const arg = name => { const prefix = `--${name}=`; const item = process.argv.find(value => value.startsWith(prefix)); return item ? item.slice(prefix.length) : ''; };

async function main() {
  const file = arg('file');
  const examId = arg('exam-id');
  const apply = process.argv.includes('--apply');
  if (!file || !examId) throw new Error('Gunakan: node scripts/question-import.mjs --file=soal.tsv --exam-id=P02 [--apply]');
  const rows = parseQuestionRows(readQuestionFile(file), examId, path.basename(file));
  const existing = await readRows(SHEETS.SOAL, { fresh: true });
  const existingIds = new Set(existing.slice(1).filter(row => String(row[0]) === examId).map(row => String(row[1])));
  const conflict = rows.map(row => row[1]).filter(id => existingIds.has(id));
  if (conflict.length) throw new Error(`SoalID sudah ada untuk ${examId}: ${conflict.join(', ')}. Impor dibatalkan agar tidak menggandakan soal.`);
  console.log(`Validasi berhasil: ${rows.length} soal untuk ujian ${examId}.`);
  if (!apply) { console.log('Mode dry-run: tidak ada perubahan pada Google Sheets. Gunakan --apply setelah hasil validasi diperiksa.'); return; }
  await appendRows(SHEETS.SOAL, rows);
  console.log(`Impor selesai: ${rows.length} soal ditambahkan ke sheet ${SHEETS.SOAL}.`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().catch(error => { console.error(`\nGagal: ${error.message}`); process.exit(1); });
