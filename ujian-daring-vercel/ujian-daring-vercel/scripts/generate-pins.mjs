// Membuat PIN untuk siswa yang kolom PinHash-nya masih kosong di sheet SISWA.
// PIN LAMA (yang sudah ada) TIDAK diubah. Jalankan:
//
//   node --env-file=.env scripts/generate-pins.mjs
//
// Setelah selesai: buka sheet PIN_DISTRIBUSI, bagikan PIN SECARA PRIBADI ke
// setiap siswa, lalu HAPUS sheet PIN_DISTRIBUSI. Hash PIN di sheet SISWA
// tetap ada sehingga siswa tetap bisa login setelah sheet itu dihapus.
import crypto from 'node:crypto';
import { SHEETS, sheetsApi, spreadsheetId } from '../api/_lib/store.js';
import { hashSiswa } from '../api/_lib/auth.js';

async function main() {
  const api = sheetsApi();
  const id = spreadsheetId();

  const res = await api.spreadsheets.values.get({ spreadsheetId: id, range: `'${SHEETS.SISWA}'` });
  const rows = res.data.values || [];
  if (rows.length < 2) { console.log('Sheet SISWA masih kosong. Isi ID, Nama, Kelas, Kelompok, Aktif dahulu.'); return; }

  const seen = new Set();
  for (let i = 1; i < rows.length; i++) {
    const sid = String(rows[i][0] || '').trim();
    const nama = String(rows[i][1] || '').trim();
    if (!sid && !nama) continue;
    if (!sid || !nama) throw new Error(`SISWA baris ${i + 1}: ID dan Nama wajib diisi.`);
    if (seen.has(sid)) throw new Error('ID siswa duplikat: ' + sid);
    seen.add(sid);
  }

  const made = [];
  const updates = [];
  for (let i = 1; i < rows.length; i++) {
    const sid = String(rows[i][0] || '').trim();
    const existingHash = String(rows[i][4] || '').trim();
    if (!sid || existingHash) continue;
    const pin = crypto.randomInt(0, 100000000).toString().padStart(8, '0');
    updates.push({ range: `'${SHEETS.SISWA}'!E${i + 1}`, values: [[hashSiswa(sid, pin)]] });
    made.push([sid, String(rows[i][1] || ''), pin]);
  }

  if (updates.length) {
    await api.spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: { valueInputOption: 'RAW', data: updates }
    });
  }

  const meta = await api.spreadsheets.get({ spreadsheetId: id });
  const hasDist = meta.data.sheets.some(s => s.properties.title === 'PIN_DISTRIBUSI');
  if (!hasDist) {
    await api.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ addSheet: { properties: { title: 'PIN_DISTRIBUSI' } } }] } });
  } else {
    await api.spreadsheets.values.clear({ spreadsheetId: id, range: `'PIN_DISTRIBUSI'` });
  }
  const body = [['ID', 'Nama', 'PIN (RAHASIA • HAPUS SHEET SETELAH DIBAGIKAN)'], ...made];
  await api.spreadsheets.values.update({
    spreadsheetId: id, range: `'PIN_DISTRIBUSI'!A1`, valueInputOption: 'RAW', requestBody: { values: body }
  });

  console.log(`${made.length} PIN baru dibuat.`);
  console.log('Buka sheet PIN_DISTRIBUSI, bagikan secara PRIBADI ke setiap siswa, lalu HAPUS sheet tersebut.');
}

main().catch(e => { console.error('\nGagal:', e.message); process.exit(1); });
