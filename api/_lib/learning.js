import crypto from 'node:crypto';
import * as store from './store.js';
import { norm, hash } from './auth.js';
import { assignmentFiles, validateUploads, uploadConfigured } from './learning-files.js';

export const ATTENDANCE_STATUSES = ['HADIR','TERLAMBAT','IZIN','SAKIT','ALPA'];
const NEW_SHEETS = ['ABSENSI_PESERTA','ABSENSI_DETAIL','MATERI','TUGAS','PENGUMPULAN','PROFIL','GURU'];
const rowsOnly = rows => rows.slice(1).filter(r => norm(r[0]));
const uid = prefix => prefix + '-' + crypto.randomUUID();
const teacherKey = p => p.id || 'ADMIN';
const profileKey = p => p.role + ':' + (p.id || 'ADMIN');
function text(value, max, required = false) {
  const s = norm(value);
  if (s.length > max || (required && !s)) throw new Error('Isian wajib belum lengkap atau terlalu panjang.');
  return s;
}
function admin(p) { if (p.role !== 'A') throw new Error('Hanya guru/admin yang dapat melakukan tindakan ini.'); }
export function safeLink(value) {
  const s = text(value, 1500);
  if (!s) return '';
  try { const u = new URL(s); if (u.protocol === 'https:' && !u.username && !u.password) return u.href; } catch {}
  throw new Error('Tautan materi harus berupa URL HTTPS.');
}
export function normalizeContent(input, kind) {
  const common = { classId: text(input.classId,80,true), title: text(input.title,160,true), status: text(input.status,10,true) };
  if (!['DRAF','TERBIT','ARSIP'].includes(common.status)) throw new Error('Status publikasi tidak valid.');
  if (kind === 'material') return { ...common, topic: text(input.topic,120), content: text(input.content,15000,true), link: safeLink(input.link) };
  const due = Number(input.due);
  if (!Number.isSafeInteger(due) || due <= 0 || due > 4102444800000) throw new Error('Batas pengumpulan wajib berupa tanggal yang valid.');
  return { ...common, instructions: text(input.instructions,15000,true), due, allowLate: input.allowLate === true };
}
export function summarizeAttendance(records) {
  const counts = Object.fromEntries([...ATTENDANCE_STATUSES,'BELUM_DICATAT'].map(s => [s,0]));
  for (const r of records) counts[r.status] = (counts[r.status] || 0) + 1;
  const recorded = ATTENDANCE_STATUSES.reduce((sum,s) => sum + counts[s], 0);
  return { counts, total: records.length, recorded, presentPercent: recorded ? Math.round((counts.HADIR + counts.TERLAMBAT) / recorded * 100) : null };
}
export function buildAttendance(sessionRows, baseRows, detailRows, rosterRows, studentRows) {
  const students = new Map(rowsOnly(studentRows).map(r => [norm(r[0]),r]));
  const sessions = new Map(rowsOnly(sessionRows).map(r => [norm(r[0]),r]));
  const records = new Map();
  const add = (sessionId, studentId, name, classId, group) => {
    const key = sessionId + ':' + studentId, session = sessions.get(sessionId);
    if (!session) return null;
    if (!records.has(key)) records.set(key,{ sessionId, studentId, name: name || students.get(studentId)?.[1] || studentId, classId: classId || norm(session[1]), className: norm(session[2]), group: group || '', title: norm(session[3]), dateMs: Number(session[4]), sessionStatus: norm(session[6]), status:'BELUM_DICATAT', note:'', updatedMs:0, markedBy:'' });
    return records.get(key);
  };
  for (const r of rowsOnly(rosterRows)) {
    const item = add(norm(r[0]),norm(r[1]),r[2],norm(r[3]),r[4]);
    if (item && item.sessionStatus === 'TUTUP') item.status = 'ALPA';
  }
  for (const r of rowsOnly(baseRows)) {
    const item = add(norm(r[1]),norm(r[2]),r[3],norm(r[4]),r[6]);
    if (item) Object.assign(item,{status: ATTENDANCE_STATUSES.includes(norm(r[8])) ? norm(r[8]) : 'HADIR', updatedMs:Number(r[7])});
  }
  for (const r of rowsOnly(detailRows)) {
    const item = add(norm(r[1]),norm(r[2]));
    if (item && ATTENDANCE_STATUSES.includes(norm(r[3]))) Object.assign(item,{ status:norm(r[3]), note:norm(r[4]), markedBy:norm(r[5]), updatedMs:Number(r[6]) });
  }
  // Legacy sessions without snapshots: do not infer absence retroactively.
  const snapshotSessions = new Set(rowsOnly(rosterRows).map(r => norm(r[0])));
  for (const [sessionId,s] of sessions) for (const [studentId,student] of students) {
    if (!snapshotSessions.has(sessionId) && norm(student[5]).toUpperCase() === 'YA' && norm(student[6]) === norm(s[1])) add(sessionId,studentId,student[1],norm(s[1]),student[3]);
  }
  return [...records.values()].sort((a,b)=>b.dateMs-a.dateMs || a.name.localeCompare(b.name,'id'));
}

export function createLearningService(db = store, files = assignmentFiles) {
  const read = (s) => db.readRows(s,{fresh:true});
  const table = async s => rowsOnly(await read(s));
  async function setup() {
    try { await db.preload(NEW_SHEETS); }
    catch (e) { if (String(e.message).includes('range') || [400,404].includes(Number(e.code || e.status))) throw new Error('Fitur pembelajaran belum diaktifkan. Admin perlu menjalankan node --env-file=.env scripts/setup-sheet.mjs.'); throw e; }
  }
  async function principal(p) {
    if (!['S','A'].includes(p.role)) throw new Error('Akses ditolak.');
    if (p.role === 'S') {
      const student = (await table('SISWA')).find(r=>norm(r[0]) === p.id && norm(r[5]).toUpperCase()==='YA');
      if (!student) throw new Error('Akun siswa tidak aktif.');
      return student;
    }
    if (p.id) {
      const teacher = (await table('GURU')).find(r=>norm(r[0])===p.id && norm(r[3])==='YA');
      if (!teacher) throw new Error('Akun guru tidak aktif.');
      return teacher;
    }
    return ['ADMIN','Guru / Admin'];
  }
  async function classroom(id) {
    const c = (await table('KELAS')).find(r=>norm(r[0])===id && norm(r[9])!=='TIDAK');
    if (!c) throw new Error('Kelas tidak ditemukan atau tidak aktif.');
    return c;
  }
  const materials = rows => rows.map(r=>({id:r[0],classId:r[1],title:r[2],topic:r[3],content:r[4],link:r[5],status:r[6],teacherId:r[7],updatedMs:Number(r[8])}));
  const tasks = rows => rows.map(r=>({id:r[0],classId:r[1],title:r[2],instructions:r[3],due:Number(r[4]),allowLate:r[5]==='YA',status:r[6],teacherId:r[7],updatedMs:Number(r[8])}));
  const submissions = rows => rows.map(r=>({id:r[0],taskId:r[1],studentId:r[2],name:r[3],note:r[4],files:JSON.parse(r[5]||'[]'),submittedMs:Number(r[6]),late:r[7]==='YA',score:r[8] === '' || r[8] == null ? null : Number(r[8]),feedback:r[9]||'',gradedBy:r[10]||'',gradedMs:Number(r[11])||0,requestId:r[12]}));
  async function attendance() {
    return buildAttendance(...await Promise.all(['ABSENSI_SESI','ABSENSI','ABSENSI_DETAIL','ABSENSI_PESERTA','SISWA'].map(read)));
  }
  async function dashboard(p) {
    await setup(); const identity = await principal(p);
    const [mat,task,sub,prof,att,classes,sessionRows] = await Promise.all([table('MATERI'),table('TUGAS'),table('PENGUMPULAN'),table('PROFIL'),attendance(),table('KELAS'),table('ABSENSI_SESI')]);
    const own = prof.filter(r=>r[0]===profileKey(p)).at(-1) || [];
    const allowed = r => p.role==='A' || (r[1]===norm(identity[6]) && r[6]==='TERBIT');
    return { profile:{ id:p.id||'ADMIN', role:p.role, name:own[1]||identity[1], officialName:identity[1], email:own[2]||'', phone:own[3]||'', bio:own[4]||'', subject:own[5]||'', className:p.role==='S'?identity[2]:'', group:p.role==='S'?identity[3]:'' },
      materials:materials(mat.filter(allowed)), tasks:tasks(task.filter(allowed)), submissions:submissions(sub.filter(r=>p.role==='A'||r[2]===p.id)),
      attendance:att.filter(r=>p.role==='A'||r.studentId===p.id),
      classes:classes.filter(r=>norm(r[9])!=='TIDAK' && (p.role==='A'||norm(r[0])===norm(identity[6]))).map(r=>({id:r[0],name:r[1]})),
      sessions:p.role==='A'?sessionRows.map(r=>({id:r[0],classId:r[1],title:r[3],dateMs:Number(r[4]),status:r[6]})):[],
      uploadConfigured:uploadConfigured(), canManageTeachers:p.role==='A'&&!p.id,
      students:p.role==='A'?(await table('SISWA')).filter(r=>norm(r[5])==='YA').map(r=>({id:r[0],name:r[1],classId:r[6]||''})):[],
      teachers:p.role==='A'&&!p.id?(await table('GURU')).map(r=>({id:r[0],name:r[1],active:r[3]==='YA'})):[]
    };
  }
  async function saveContent(p,input,kind) {
    admin(p); await setup(); await principal(p);
    const v = normalizeContent(input,kind); await classroom(v.classId);
    const sheet = kind==='material'?'MATERI':'TUGAS', rows=await read(sheet), index=rows.findIndex((r,i)=>i>0&&r[0]===input.id);
    if (input.id && index<0) throw new Error('Konten tidak ditemukan.');
    if (index>0 && rows[index][1]!==v.classId) throw new Error('Kelas konten yang sudah dibuat tidak dapat diganti. Buat konten baru.');
    const id = index>0?input.id:uid(kind==='material'?'MAT':'TGS');
    const row = kind==='material'?[id,v.classId,v.title,v.topic,v.content,v.link,v.status,teacherKey(p),db.nowMs()]:[id,v.classId,v.title,v.instructions,v.due,v.allowLate?'YA':'TIDAK',v.status,teacherKey(p),db.nowMs()];
    if(index>0) await db.writeCells(sheet,`A${index+1}:I${index+1}`,[row]); else await db.appendRows(sheet,[row]);
    return {ok:true,id};
  }
  async function markAttendance(p,input) {
    admin(p); await setup(); await principal(p);
    const status=text(input.status,20,true), note=text(input.note,500);
    if(!ATTENDANCE_STATUSES.includes(status)) throw new Error('Status kehadiran tidak valid.');
    const item=(await attendance()).find(r=>r.sessionId===input.sessionId&&r.studentId===input.studentId);
    if(!item) throw new Error('Siswa bukan peserta sesi ini.');
    await db.appendRows('ABSENSI_DETAIL',[[uid('CAT'),item.sessionId,item.studentId,status,note,teacherKey(p),db.nowMs()]]);
    return {ok:true};
  }
  async function saveProfile(p,input) {
    await setup();await principal(p);
    const name=text(input.name,120,true),email=text(input.email,150),phone=text(input.phone,40),bio=text(input.bio,800),subject=p.role==='A'?text(input.subject,150):'';
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email tidak valid.');
    await db.appendRows('PROFIL',[[profileKey(p),name,email,phone,bio,subject,db.nowMs()]]);
    return {ok:true};
  }
  async function createTeacher(p,input) {
    admin(p);if(p.id)throw new Error('Hanya admin utama dapat membuat akun guru.');await setup();
    const id=text(input.id,40,true),name=text(input.name,120,true),password=text(input.password,80,true);
    if(!/^[A-Za-z0-9._-]{2,40}$/.test(id)||id==='ADMIN'||password.length<10)throw new Error('ID guru 2–40 karakter dan kata sandi minimal 10 karakter.');
    if((await table('GURU')).some(r=>r[0]===id))throw new Error('ID guru sudah digunakan.');
    await db.appendRows('GURU',[[id,name,hash('GURU:'+id+':'+password),'YA']]);return {ok:true};
  }
  async function submit(p,input) {
    if(p.role!=='S')throw new Error('Hanya siswa dapat mengumpulkan tugas.');
    await setup();const student=await principal(p);
    const task=tasks(await table('TUGAS')).find(t=>t.id===input.taskId&&t.classId===norm(student[6])&&t.status==='TERBIT');
    if(!task)throw new Error('Tugas tidak tersedia untuk kelas Anda.');
    const now=db.nowMs(); if(now>task.due&&!task.allowLate)throw new Error('Batas pengumpulan sudah lewat.');
    const note=text(input.note,2000),requestId=text(input.requestId,80,true);
    if(!/^[A-Za-z0-9_-]{8,80}$/.test(requestId))throw new Error('ID pengiriman tidak valid.');
    const existing=submissions(await table('PENGUMPULAN')).find(s=>s.studentId===p.id&&s.taskId===task.id&&s.requestId===requestId);
    if(existing)return {ok:true,id:existing.id};
    const validated=validateUploads(input.files);await files.checkFolder();
    const id=uid('KRM'), uploaded=[];
    try {
      for(const file of validated)uploaded.push(await files.put(file,id));
    } catch(e) {
      await Promise.allSettled(uploaded.map(f=>files.remove(f.id)));
      throw new Error('Unggahan belum berhasil. Periksa akses Drive atau coba lagi.');
    }
    // Keep uploads if the Sheets response is uncertain: never delete files which may already be referenced.
    await db.appendRows('PENGUMPULAN',[[id,task.id,p.id,student[1],note,JSON.stringify(uploaded),now,now>task.due?'YA':'TIDAK','','','','',requestId]]);
    return {ok:true,id};
  }
  async function grade(p,input) {
    admin(p);await setup();await principal(p);
    const score=input.score === '' || input.score == null ? NaN:Number(input.score),feedback=text(input.feedback,2000);
    if(!Number.isFinite(score)||score<0||score>100)throw new Error('Nilai harus 0–100.');
    const rows=await read('PENGUMPULAN'),i=rows.findIndex((r,n)=>n>0&&r[0]===input.submissionId);
    if(i<0)throw new Error('Pengumpulan tidak ditemukan.');
    await db.writeCells('PENGUMPULAN',`I${i+1}:L${i+1}`,[[score,feedback,teacherKey(p),db.nowMs()]]);return {ok:true};
  }
  async function download(p,input) {
    await setup();await principal(p);
    const sub=submissions(await table('PENGUMPULAN')).find(s=>s.id===input.submissionId && (p.role==='A'||s.studentId===p.id));
    const file=sub?.files.find(f=>f.id===input.fileId);
    if(!file)throw new Error('Berkas tidak ditemukan atau akses ditolak.');
    return files.get(file);
  }
  return { dashboard, saveContent, markAttendance, saveProfile, createTeacher, submit, grade, download, async checkStorage(p){admin(p);await principal(p);return files.checkFolder();} };
}

export const learning = createLearningService();

export async function captureAttendanceRoster(sessionId,classId) {
  try { await store.readRows('ABSENSI_PESERTA'); }
  catch(e) { if([400,404].includes(Number(e.code||e.status)) || /range/i.test(e.message))return;throw e; }
  const students=rowsOnly(await store.readRows('SISWA',{fresh:true})).filter(r=>norm(r[6])===classId&&norm(r[5])==='YA');
  if(students.length)await store.appendRows('ABSENSI_PESERTA',students.map(r=>[sessionId,r[0],r[1],classId,r[3]]));
}
