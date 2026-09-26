import { google } from 'googleapis';
import { Readable } from 'node:stream';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 5;
const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };

export function validateUploads(files) {
  if (!Array.isArray(files) || !files.length || files.length > MAX_UPLOAD_FILES) throw new Error('Pilih 1–5 foto atau PDF.');
  let total = 0;
  return files.map((file, i) => {
    const mime = String(file?.mime || '');
    const base64 = String(file?.base64 || '');
    if (!extensions[mime] || base64.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error('Berkas tidak valid. Gunakan JPG, PNG, WEBP, atau PDF.');
    const bytes = Buffer.from(base64, 'base64');
    const valid = mime === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255])) :
      mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
      mime === 'image/webp' ? bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' : bytes.subarray(0, 5).toString() === '%PDF-';
    total += bytes.length;
    if (!valid || !bytes.length) throw new Error('Isi berkas tidak cocok dengan formatnya.');
    if (total > MAX_UPLOAD_BYTES) throw new Error('Total berkas maksimal 2 MB setelah foto diperkecil.');
    const stem = String(file.name || `tugas-${i+1}`).replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _.-]/gu, '_').slice(0, 80) || 'tugas';
    return { name: stem + extensions[mime], mime, bytes, size: bytes.length };
  });
}

export function uploadConfigured() {
  return Boolean(process.env.ASSIGNMENT_DRIVE_FOLDER_ID && (
    (process.env.DRIVE_OAUTH_CLIENT_ID && process.env.DRIVE_OAUTH_CLIENT_SECRET && process.env.DRIVE_OAUTH_REFRESH_TOKEN) ||
    (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  ));
}
function uploadDrive() {
  if (!uploadConfigured()) throw new Error('Penyimpanan tugas belum diatur oleh admin.');
  let auth;
  if (process.env.DRIVE_OAUTH_REFRESH_TOKEN) {
    auth = new google.auth.OAuth2(process.env.DRIVE_OAUTH_CLIENT_ID, process.env.DRIVE_OAUTH_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.DRIVE_OAUTH_REFRESH_TOKEN });
  } else {
    auth = new google.auth.JWT({ email: process.env.GOOGLE_CLIENT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/drive'] });
  }
  return google.drive({ version: 'v3', auth });
}

export const assignmentFiles = {
  async checkFolder() {
    const drive = uploadDrive();
    const { data } = await drive.files.get({ fileId: process.env.ASSIGNMENT_DRIVE_FOLDER_ID, supportsAllDrives: true, fields: 'id,mimeType,driveId,capabilities(canAddChildren),permissions(type,role)' });
    if (data.mimeType !== 'application/vnd.google-apps.folder' || !data.capabilities?.canAddChildren) throw new Error('Folder tugas tidak dapat ditulisi. Periksa akses Google Drive.');
    if (!process.env.DRIVE_OAUTH_REFRESH_TOKEN && !data.driveId) throw new Error('Service account memerlukan folder Shared Drive. Untuk My Drive gunakan OAuth pemilik.');
    if (data.permissions?.some(p => ['anyone','domain'].includes(p.type))) throw new Error('Folder tugas harus privat, bukan dibagikan ke publik/domain.');
    return { ok: true };
  },
  async put(file, prefix) {
    const { data } = await uploadDrive().files.create({
      supportsAllDrives: true, fields: 'id',
      requestBody: { name: prefix + '-' + file.name, parents: [process.env.ASSIGNMENT_DRIVE_FOLDER_ID] },
      media: { mimeType: file.mime, body: Readable.from(file.bytes) }
    });
    return { id: data.id, name: file.name, mime: file.mime, size: file.size };
  },
  async remove(id) { await uploadDrive().files.delete({ fileId: id, supportsAllDrives: true }); },
  async get(file) {
    const drive = uploadDrive();
    const { data: meta } = await drive.files.get({ fileId: file.id, supportsAllDrives: true, fields: 'mimeType,size' });
    if (!extensions[meta.mimeType] || Number(meta.size) > MAX_UPLOAD_BYTES) throw new Error('Berkas tidak valid atau terlalu besar.');
    const { data } = await drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    const bytes = Buffer.from(data);
    if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('Berkas terlalu besar.');
    return { name: file.name, mime: meta.mimeType, base64: bytes.toString('base64') };
  }
};
