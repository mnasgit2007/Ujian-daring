// Membuat ADMIN_HASH dari HASH_SECRET + kata sandi admin.
// Jalankan: node scripts/hash-secret.mjs <HASH_SECRET> <kata-sandi-admin>
import crypto from 'node:crypto';

const [, , secret, password] = process.argv;
if (!secret || !password) {
  console.error('Cara pakai: node scripts/hash-secret.mjs "<HASH_SECRET>" "<kata-sandi-admin>"');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Kata sandi admin sebaiknya minimal 12 karakter.');
}
const hash = crypto.createHash('sha256').update(secret + '|ADMIN:' + password, 'utf8').digest('hex');
console.log('\nADMIN_HASH=' + hash + '\n');
