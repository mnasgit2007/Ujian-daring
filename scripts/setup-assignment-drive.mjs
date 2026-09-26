// Run locally after setting DRIVE_OAUTH_CLIENT_ID and DRIVE_OAUTH_CLIENT_SECRET.
// Creates an app-owned private folder using drive.file; never prints refresh tokens.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { google } from 'googleapis';
const redirect='http://localhost:8787/oauth/callback';
if(!process.env.DRIVE_OAUTH_CLIENT_ID||!process.env.DRIVE_OAUTH_CLIENT_SECRET)throw new Error('Isi DRIVE_OAUTH_CLIENT_ID dan DRIVE_OAUTH_CLIENT_SECRET di .env.');
try { await fs.access('.env.drive'); throw new Error('.env.drive sudah ada. Simpan konfigurasi lama sebelum setup ulang.'); }
catch(e) { if(e.code !== 'ENOENT') throw e; }
const auth=new google.auth.OAuth2(process.env.DRIVE_OAUTH_CLIENT_ID,process.env.DRIVE_OAUTH_CLIENT_SECRET,redirect);
const state=crypto.randomBytes(24).toString('hex');
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,redirect);
 if(url.pathname!=='/oauth/callback'){res.writeHead(404).end();return;}
 if(url.searchParams.get('state')!==state){res.writeHead(403).end('State tidak cocok.');return;}
 if(url.searchParams.has('error')){res.writeHead(400).end('Otorisasi dibatalkan.');clearTimeout(timer);server.close();return;}
 try {
  const {tokens}=await auth.getToken(url.searchParams.get('code'));if(!tokens.refresh_token)throw new Error('Refresh token tidak tersedia; cabut persetujuan aplikasi ini lalu coba lagi.');
  auth.setCredentials(tokens);
  const drive=google.drive({version:'v3',auth});
  const {data}=await drive.files.create({requestBody:{name:'Ujian Daring - Pengumpulan Tugas',mimeType:'application/vnd.google-apps.folder'},fields:'id'});
  const text=['# Rahasia. Jangan commit atau bagikan file ini.',`DRIVE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`,`ASSIGNMENT_DRIVE_FOLDER_ID=${data.id}`,''].join('\n');
  await fs.writeFile('.env.drive',text,{mode:0o600,flag:'wx'});
  console.log('Selesai. Konfigurasi rahasia disimpan ke .env.drive. Salin nilainya ke Environment Variables Vercel.');
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}).end('Drive siap. Tutup tab ini lalu kembali ke terminal.');
 }catch(e){console.error('Setup gagal:',e.message);res.writeHead(500).end('Setup gagal. Lihat terminal.');}
 finally{clearTimeout(timer);server.close();}
});
const timer=setTimeout(()=>{console.error('Waktu otorisasi habis. Jalankan kembali.');server.close();},5*60*1000);
server.listen(8787,'localhost',()=>{
 console.log('Buka tautan ini menggunakan akun Google pemilik penyimpanan tugas:');
 console.log(auth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/drive.file'],state}));
});
server.on('error',e=>{clearTimeout(timer);console.error('Server lokal gagal:',e.message);process.exitCode=1;});
