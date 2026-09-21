// Menyiapkan tab dan header sheet pada Spreadsheet yang sudah dibuat dan
// dibagikan (Editor) ke akun layanan (service account). Jalankan sekali:
//
//   node --env-file=.env scripts/setup-sheet.mjs
//
// Tambahkan --demo untuk juga membuat contoh ujian (status TUTUP, 5 soal),
// persis seperti fungsi buatContohUjian_() versi Apps Script lama.
import { SHEETS, HEADERS, sheetsApi, spreadsheetId } from '../api/_lib/store.js';

const DEMO = process.argv.includes('--demo');

async function main() {
  const api = sheetsApi();
  const id = spreadsheetId();

  const meta = await api.spreadsheets.get({ spreadsheetId: id });
  const existing = new Set(meta.data.sheets.map(s => s.properties.title));

  const toCreate = Object.keys(HEADERS).filter(name => !existing.has(name));
  if (toCreate.length) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: { requests: toCreate.map(name => ({ addSheet: { properties: { title: name } } })) }
    });
    console.log('Sheet dibuat:', toCreate.join(', '));
  }

  for (const name of Object.keys(HEADERS)) {
    const range = `'${name}'!A1:${colLetter(HEADERS[name].length)}1`;
    const current = await api.spreadsheets.values.get({ spreadsheetId: id, range });
    const firstRow = (current.data.values && current.data.values[0]) || [];
    if (firstRow.join('|') === HEADERS[name].join('|')) continue;
    if (firstRow.length && firstRow.some(v => String(v).trim())) {
      throw new Error(`Header sheet ${name} sudah ada tetapi berbeda dari yang diharapkan. Periksa manual sebelum melanjutkan.\nDitemukan: ${firstRow.join(' | ')}\nDiharapkan: ${HEADERS[name].join(' | ')}`);
    }
    await api.spreadsheets.values.update({
      spreadsheetId: id, range, valueInputOption: 'RAW', requestBody: { values: [HEADERS[name]] }
    });
    console.log('Header ditulis:', name);
  }

  if (DEMO) await ensureDemoExam(api, id);

  console.log('\nSetup selesai. Sheet siap dipakai:', Object.keys(HEADERS).join(', '));
  console.log('Selanjutnya: isi sheet SISWA lalu jalankan `npm run generate-pins`.');
}

async function ensureDemoExam(api, id) {
  const ujianRange = `'${SHEETS.UJIAN}'`;
  const current = await api.spreadsheets.values.get({ spreadsheetId: id, range: ujianRange });
  const rows = current.data.values || [];
  if (rows.slice(1).some(r => String(r[0]) === 'DKV-DEMO-01')) {
    console.log('Contoh ujian DKV-DEMO-01 sudah ada, dilewati.');
    return;
  }
  const now = new Date();
  const start = fmt(new Date(now.getTime() - 3600000));
  const end = fmt(new Date(now.getTime() + 7 * 86400000));
  await api.spreadsheets.values.append({
    spreadsheetId: id, range: ujianRange, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [['DKV-DEMO-01', 'Latihan DKV — Desain sebagai Komunikasi', 20, start, end, 'TUTUP', 'YA']] }
  });
  const soalRows = [
    ['DKV-DEMO-01', 'Q01', 'Tujuan utama desain komunikasi visual adalah ...', 'Memenuhi semua ruang kosong', 'Menyampaikan pesan kepada audiens', 'Menggunakan efek sebanyak mungkin', 'Mengikuti selera pembuat', 'B', 20, ''],
    ['DKV-DEMO-01', 'Q02', 'Saat menilai poster, tindakan yang menunjukkan berpikir kritis adalah ...', 'Mengatakan bagus tanpa alasan', 'Mengikuti pendapat teman', 'Menunjukkan bukti visual dan alasannya', 'Menghitung jumlah warna saja', 'C', 20, ''],
    ['DKV-DEMO-01', 'Q03', 'Yang dimaksud dengan audiens adalah ...', 'Perangkat lunak desain', 'Orang yang menjadi sasaran pesan', 'Ukuran kertas cetak', 'Nama jenis huruf', 'B', 20, ''],
    ['DKV-DEMO-01', 'Q04', 'Mengapa desainer perlu mengetahui target audiens?', 'Supaya semua desain identik', 'Supaya kebutuhan dan pesan dapat disesuaikan', 'Supaya tidak perlu riset', 'Supaya warna selalu merah', 'B', 20, ''],
    ['DKV-DEMO-01', 'Q05', 'Dalam proses menggunakan AI untuk desain, siapa yang memilih dan mempertanggungjawabkan keputusan akhir?', 'AI secara otomatis', 'Penonton acak', 'Desainer', 'Tidak ada', 'C', 20, '']
  ];
  await api.spreadsheets.values.append({
    spreadsheetId: id, range: `'${SHEETS.SOAL}'`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: soalRows }
  });
  console.log('Contoh ujian DKV-DEMO-01 dibuat dengan status TUTUP (5 soal). Periksa lalu ubah ke BUKA saat siap.');
}

function fmt(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

main().catch(e => { console.error('\nGagal:', e.message); process.exit(1); });
