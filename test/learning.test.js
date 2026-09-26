import test from 'node:test';
import assert from 'node:assert/strict';
import { createLearningService, buildAttendance, summarizeAttendance, normalizeContent, safeLink } from '../api/_lib/learning.js';
import { validateUploads, MAX_UPLOAD_BYTES } from '../api/_lib/learning-files.js';
import { HEADERS } from '../api/_lib/store.js';
process.env.HASH_SECRET='learning-test-secret';
const admin={role:'A'}, student={role:'S',id:'S1'};
const pdf={name:'jawaban.pdf',mime:'application/pdf',base64:Buffer.from('%PDF-1.4\nfixture').toString('base64')};
function fixture(){
 const tables=Object.fromEntries(Object.entries(HEADERS).map(([k,h])=>[k,[[...h]]]));
 tables.SISWA.push(['S1','Ani','XI DKV','1','secret','YA','K1'],['S2','Budi','XI ATR','2','secret','YA','K2']);
 tables.KELAS.push(['K1','XI DKV','','','','','','','','YA'],['K2','XI ATR','','','','','','','','YA']);
 tables.GURU.push(['G1','Guru Satu','hash','YA']);
 tables.MATERI.push(['M1','K1','Baca','Bab 1','Isi','https://example.org','TERBIT','ADMIN',1],['M2','K2','Lain','','Isi','','TERBIT','ADMIN',1],['M3','K1','Draf','','Isi','','DRAF','ADMIN',1]);
 tables.TUGAS.push(['T1','K1','Gambar','Foto jawaban',2000,'TIDAK','TERBIT','ADMIN',1],['T2','K2','Lain','Instruksi',2000,'YA','TERBIT','ADMIN',1]);
 tables.ABSENSI_SESI.push(['A1','K1','XI DKV','P01',100,'','BUKA']);
 tables.ABSENSI_PESERTA.push(['A1','S1','Ani','K1','1']);
 const storage={next:1,deleted:[],async checkFolder(){return {ok:true};},async put(f){return {id:'F'+this.next++,name:f.name,mime:f.mime,size:f.size};},async remove(id){this.deleted.push(id);},async get(f){return {name:f.name,mime:f.mime,base64:pdf.base64};}};
 const db={nowMs:()=>1000,async preload(names){names.forEach(n=>{if(!tables[n])throw new Error('missing range');});},async readRows(s){return structuredClone(tables[s]);},async appendRows(s,rs){tables[s].push(...structuredClone(rs));return tables[s].length;},async writeCells(s,a1,rs){const m=a1.match(/^([A-Z]+)(\d+)/);let col=0;for(const c of m[1])col=col*26+c.charCodeAt(0)-64;const row=Number(m[2])-1;rs.forEach((r,i)=>r.forEach((v,j)=>tables[s][row+i][col-1+j]=v));}};
 return {tables,db,storage,service:createLearningService(db,storage)};
}
test('student portal isolates class content, own submissions, attendance and profile',async()=>{
 const {tables,service}=fixture();tables.PENGUMPULAN.push(['X','T2','S2','Budi','','[]',10,'TIDAK',80,'private']);tables.PROFIL.push(['S:S2','Budi','private@example.org','secret','','',1]);
 const d=await service.dashboard(student);assert.deepEqual(d.materials.map(m=>m.id),['M1']);assert.deepEqual(d.tasks.map(t=>t.id),['T1']);assert.equal(d.submissions.length,0);assert.equal(d.students.length,0);assert.equal(d.teachers.length,0);assert.equal(d.attendance.length,1);assert.equal(d.profile.email,'');assert.ok(!JSON.stringify(d).includes('secret'));
});
test('inactive and unknown roles are refused',async()=>{
 const {tables,service}=fixture();tables.SISWA[1][5]='TIDAK';await assert.rejects(service.dashboard(student),/tidak aktif/);await assert.rejects(service.dashboard({role:'X'}),/ditolak/);tables.GURU[1][3]='TIDAK';await assert.rejects(service.dashboard({role:'A',id:'G1'}),/tidak aktif/);
});
test('student cannot create content, grade, correct attendance or create a teacher',async()=>{
 const {service}=fixture();await assert.rejects(service.saveContent(student,{},'material'),/guru/);await assert.rejects(service.grade(student,{}),/guru/);await assert.rejects(service.markAttendance(student,{}),/guru/);await assert.rejects(service.createTeacher(student,{}),/guru/);
});
test('teacher publishes material to its chosen class and cannot move existing content',async()=>{
 const {service,tables}=fixture();const v={classId:'K1',title:'Materi baru',content:'Isi',status:'TERBIT',link:'https://example.org/a'};
 await service.saveContent(admin,v,'material');assert.equal(tables.MATERI.at(-1)[2],v.title);await assert.rejects(service.saveContent(admin,{...v,id:'M1',classId:'K2'},'material'),/tidak dapat diganti/);
});
test('content validation rejects unsafe URLs, invalid dates and oversized text',()=>{
 assert.throws(()=>safeLink('javascript:alert(1)'),/HTTPS/);assert.throws(()=>safeLink('https://user:password@example.org'),/HTTPS/);assert.throws(()=>normalizeContent({classId:'K1',title:'T',instructions:'I',status:'TERBIT',due:'bad'},'task'),/tanggal/);assert.throws(()=>normalizeContent({classId:'K1',title:'T',content:'a'.repeat(16000),status:'TERBIT'},'material'),/panjang/);
});
test('attendance preserves history across transfers and uses explicit corrections',()=>{
 const {tables}=fixture();tables.ABSENSI_SESI[1][6]='TUTUP';tables.SISWA[1][6]='K2';
 let r=buildAttendance(tables.ABSENSI_SESI,tables.ABSENSI,tables.ABSENSI_DETAIL,tables.ABSENSI_PESERTA,tables.SISWA);assert.equal(r[0].status,'ALPA');assert.equal(r[0].studentId,'S1');
 tables.ABSENSI_DETAIL.push(['C1','A1','S1','SAKIT','Surat dokter','G1',110]);r=buildAttendance(tables.ABSENSI_SESI,tables.ABSENSI,tables.ABSENSI_DETAIL,tables.ABSENSI_PESERTA,tables.SISWA);assert.equal(r[0].status,'SAKIT');assert.equal(r[0].note,'Surat dokter');
});
test('legacy sessions do not invent absence; open sessions remain unrecorded',()=>{
 const {tables}=fixture();tables.ABSENSI_SESI[1][6]='TUTUP';tables.ABSENSI_PESERTA.length=1;
 const r=buildAttendance(tables.ABSENSI_SESI,tables.ABSENSI,tables.ABSENSI_DETAIL,tables.ABSENSI_PESERTA,tables.SISWA);assert.equal(r[0].status,'BELUM_DICATAT');assert.equal(summarizeAttendance(r).presentPercent,null);
 assert.equal(summarizeAttendance([{status:'HADIR'},{status:'TERLAMBAT'},{status:'SAKIT'},{status:'ALPA'},{status:'BELUM_DICATAT'}]).presentPercent,50);
});
test('attendance corrections reject unrelated students and append an audit trail',async()=>{
 const {service,tables}=fixture();await assert.rejects(service.markAttendance(admin,{sessionId:'A1',studentId:'S2',status:'HADIR'}),/bukan peserta/);
 await service.markAttendance(admin,{sessionId:'A1',studentId:'S1',status:'IZIN',note:'Lomba'});await service.markAttendance({role:'A',id:'G1'},{sessionId:'A1',studentId:'S1',status:'SAKIT',note:'Koreksi'});
 assert.equal(tables.ABSENSI_DETAIL.length,3);const d=await service.dashboard(student);assert.equal(d.attendance[0].status,'SAKIT');
});
test('upload validates signature, type, file count and total decoded size',()=>{
 assert.equal(validateUploads([pdf])[0].mime,'application/pdf');assert.throws(()=>validateUploads([{...pdf,mime:'image/png'}]),/cocok/);assert.throws(()=>validateUploads(Array(6).fill(pdf)),/1–5/);assert.throws(()=>validateUploads([{...pdf,mime:'text/html'}]),/valid/);
 const bytes=Buffer.alloc(MAX_UPLOAD_BYTES+1,65);bytes.write('%PDF-');assert.throws(()=>validateUploads([{...pdf,base64:bytes.toString('base64')}]),/2 MB|valid/);
});
test('student submission records proof and retries reuse that proof',async()=>{
 const {service,tables}=fixture();const v={taskId:'T1',requestId:'request_123',files:[pdf],note:'Jawaban'};const a=await service.submit(student,v),b=await service.submit(student,v);assert.equal(a.id,b.id);assert.equal(tables.PENGUMPULAN.length,2);assert.equal(JSON.parse(tables.PENGUMPULAN[1][5])[0].name,'jawaban.pdf');
});
test('submission rejects foreign classes, drafts, inactive accounts and closed deadlines',async()=>{
 const {service,tables}=fixture();const v={taskId:'T1',requestId:'request_123',files:[pdf]};await assert.rejects(service.submit(student,{...v,taskId:'T2'}),/kelas/);tables.TUGAS[1][6]='DRAF';await assert.rejects(service.submit(student,v),/tersedia/);tables.TUGAS[1][6]='TERBIT';tables.TUGAS[1][4]=500;await assert.rejects(service.submit(student,v),/lewat/);tables.TUGAS[1][5]='YA';await service.submit(student,v);assert.equal(tables.PENGUMPULAN[1][7],'YA');
});
test('files remain owner/admin only, even when arbitrary identifiers are supplied',async()=>{
 const {service,tables}=fixture();await service.submit(student,{taskId:'T1',requestId:'request_123',files:[pdf]});const sub=tables.PENGUMPULAN[1],file=JSON.parse(sub[5])[0],input={submissionId:sub[0],fileId:file.id};
 await assert.rejects(service.download({role:'S',id:'S2'},input),/ditolak/);assert.equal((await service.download(student,input)).name,file.name);assert.equal((await service.download(admin,input)).name,file.name);await assert.rejects(service.download(student,{...input,fileId:'foreign'}),/ditolak/);
});
test('partial Drive upload failure cleans uploaded files and creates no submission',async()=>{
 const {service,storage,tables}=fixture();const put=storage.put.bind(storage);storage.put=async f=>{if(storage.next===2)throw new Error('Drive failure');return put(f);};await assert.rejects(service.submit(student,{taskId:'T1',requestId:'request_123',files:[pdf,pdf]}),/Unggahan/);assert.deepEqual(storage.deleted,['F1']);assert.equal(tables.PENGUMPULAN.length,1);
});
test('grade feedback reaches the owner and rejects invalid grades',async()=>{
 const {service,tables}=fixture();await service.submit(student,{taskId:'T1',requestId:'request_123',files:[pdf]});const submissionId=tables.PENGUMPULAN[1][0];await assert.rejects(service.grade(admin,{submissionId,score:''}),/0–100/);await assert.rejects(service.grade(admin,{submissionId,score:101}),/0–100/);await service.grade(admin,{submissionId,score:87.5,feedback:'Sudah baik'});const d=await service.dashboard(student);assert.equal(d.submissions[0].score,87.5);assert.equal(d.submissions[0].feedback,'Sudah baik');
});
test('profile writes cannot change student identity/class and named teachers have separate profiles',async()=>{
 const {service,tables}=fixture();await service.saveProfile(student,{name:'Ani Baru',id:'S2',classId:'K2',email:'ani@example.org'});assert.equal(tables.PROFIL.at(-1)[0],'S:S1');assert.equal(tables.SISWA[1][6],'K1');await service.saveProfile({role:'A',id:'G1'},{name:'Guru Satu',subject:'DKV'});assert.equal(tables.PROFIL.at(-1)[0],'A:G1');assert.equal((await service.dashboard(admin)).profile.name,'Guru / Admin');
});
test('only principal admin provisions named teachers and stores hashes, not passwords',async()=>{
 const {service,tables}=fixture();await assert.rejects(service.createTeacher({role:'A',id:'G1'},{id:'G2',name:'Guru Dua',password:'long-password'}),/utama/);await service.createTeacher(admin,{id:'G2',name:'Guru Dua',password:'long-password'});assert.notEqual(tables.GURU.at(-1)[2],'long-password');assert.match(tables.GURU.at(-1)[2],/^[a-f0-9]{64}$/);
});

test('students transferred into a class do not join its historical snapshot', async()=>{
 const {tables,service}=fixture();tables.SISWA[2][6]='K1';
 const d=await service.dashboard(admin);assert.deepEqual(d.attendance.map(r=>r.studentId),['S1']);
 await assert.rejects(service.markAttendance(admin,{sessionId:'A1',studentId:'S2',status:'ALPA'}),/bukan peserta/);
});
