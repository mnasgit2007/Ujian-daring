import crypto from 'node:crypto';
import * as store from './store.js';
import { norm } from './auth.js';

const rows = a => a.slice(1).filter(r => norm(r[0]));
export async function optionalAcademicRows(db, name) {
  try { return await db.readRows(name, { fresh:true }); }
  catch(e) {
    // A missing sheet is compatible with the old app; network/auth failures are not.
    if (/Unable to parse range|missing range|tab tidak ditemukan/i.test(e.message)) return null;
    throw e;
  }
}
export const witaDay = ms => new Date(ms + 8*3600000).toISOString().slice(0,10);
export function validDay(s) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
}
const epoch = (date, time) => Date.parse(date+'T'+time+':00+08:00');
export function latestRosters(data) {
  const result={};
  for (const r of rows(data || [[]])) result[r[0]]={classIds:JSON.parse(r[1]),studentIds:JSON.parse(r[2]),updatedMs:Number(r[4])};
  return result;
}
export function eligibleForExam(rosters, examId, studentId) {
  return !rosters[examId] || rosters[examId].studentIds.includes(studentId);
}
export function uniqueAttempts(attempts) {
  const map=new Map();
  for(const a of attempts) if(a.status!=='RESET')map.set(a.examId+':'+a.studentId,a);
  return [...map.values()];
}
export function scheduleRows(data) {
  const map=new Map();
  for(const r of rows(data || [[]]))map.set(r[0],{id:r[0],classId:r[1],teacherId:r[2],subject:r[3],weekday:Number(r[4]),start:r[5],end:r[6],room:r[7],from:r[8],until:r[9],status:r[10]});
  return [...map.values()];
}
export function occurrences(schedules, exceptions, from, until) {
  if(!validDay(from)||!validDay(until)||until<from||(Date.parse(until)-Date.parse(from))/86400000>92)throw new Error('Rentang kalender maksimal 93 hari.');
  const cancelled=new Map(rows(exceptions || [[]]).map(r=>[r[0]+':'+r[1],r[2]])),out=[];
  for(let n=Date.parse(from+'T00:00:00Z');n<=Date.parse(until+'T00:00:00Z');n+=86400000){
    const day=new Date(n).toISOString().slice(0,10),weekday=new Date(n).getUTCDay();
    for(const s of schedules)if(s.status==='TERBIT'&&s.weekday===weekday&&day>=s.from&&day<=s.until){
      const key=s.id+':'+day;
      out.push({...s,date:day,startMs:epoch(day,s.start),endMs:epoch(day,s.end),cancelled:cancelled.has(key),note:cancelled.get(key)||'',sessionId:'JAD-'+crypto.createHash('sha256').update(key).digest('hex').slice(0,24)});
    }
  }
  return out.sort((a,b)=>a.startMs-b.startMs);
}
export function normalizeSchedule(v) {
  const t=(key,max,required=true)=>{const s=norm(v[key]);if((required&&!s)||s.length>max)throw new Error('Isian jadwal belum lengkap atau terlalu panjang.');return s;};
  const out={classId:t('classId',80),teacherId:t('teacherId',40),subject:t('subject',120),room:t('room',100,false),from:t('from',10),until:t('until',10),start:t('start',5),end:t('end',5),status:t('status',10),weekday:Number(v.weekday)};
  if(!Number.isInteger(out.weekday)||out.weekday<0||out.weekday>6||!/^([01]\d|2[0-3]):[0-5]\d$/.test(out.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(out.end)||out.start>=out.end||!validDay(out.from)||!validDay(out.until)||out.from>out.until||!['DRAF','TERBIT','ARSIP'].includes(out.status))throw new Error('Hari, jam, tanggal, atau status jadwal tidak valid.');
  return out;
}
export function scheduleConflict(a,b) {
  if(a.status!=='TERBIT'||b.status!=='TERBIT'||a.weekday!==b.weekday||a.from>b.until||b.from>a.until||a.start>=b.end||b.start>=a.end)return false;
  const start=[a.from,b.from].sort().at(-1),end=[a.until,b.until].sort()[0];
  const first=Date.parse(start+'T00:00:00Z'),delta=(a.weekday-new Date(first).getUTCDay()+7)%7;
  return first+delta*86400000<=Date.parse(end+'T00:00:00Z')&&(a.classId===b.classId||a.teacherId===b.teacherId);
}
export function createAcademicService(db=store) {
  const read=name=>db.readRows(name,{fresh:true});
  async function admin(p){
    if(p.role!=='A')throw new Error('Hanya guru/admin.');
    if(p.id&&!rows(await read('GURU')).some(r=>r[0]===p.id&&r[3]==='YA'))throw new Error('Akun guru tidak aktif.');
  }
  async function ready(){
    if(!(await optionalAcademicRows(db,'JADWAL'))||!(await optionalAcademicRows(db,'PESERTA_UJIAN'))||!(await optionalAcademicRows(db,'JADWAL_PENGECUALIAN')))throw new Error('Jalankan setup-sheet.mjs untuk mengaktifkan jadwal dan peserta ujian.');
  }
  async function saveRoster(p,input){
    await admin(p);await ready();
    const exams=rows(await read('UJIAN'));
    if(!exams.some(r=>r[0]===input.examId))throw new Error('Ujian tidak ditemukan.');
    const classIds=[...new Set(input.classIds||[])];
    if(!Array.isArray(input.classIds)||!classIds.length||classIds.length>50)throw new Error('Pilih kelas peserta.');
    const classes=rows(await read('KELAS'));
    if(classIds.some(id=>!classes.some(r=>r[0]===id&&r[9]!=='TIDAK')))throw new Error('Kelas tidak aktif.');
    const candidates=rows(await read('SISWA')).filter(r=>r[5]==='YA'&&classIds.includes(r[6])).map(r=>r[0]);
    const studentIds=[...new Set(input.studentIds||[])];
    if(!Array.isArray(input.studentIds)||!studentIds.length||studentIds.some(id=>!candidates.includes(id)))throw new Error('Pilih siswa aktif dari kelas tujuan.');
    // Freeze once any attempt exists, including resets: do not revoke an ongoing exam.
    if(rows(await read('SESI')).some(r=>r[1]===input.examId))throw new Error('Peserta tidak dapat diubah setelah ada percobaan ujian.');
    await db.appendRows('PESERTA_UJIAN',[[input.examId,JSON.stringify(classIds),JSON.stringify(studentIds),p.id||'ADMIN',db.nowMs()]]);
    return {ok:true};
  }
  async function saveSchedule(p,input){
    await admin(p);await ready();const v=normalizeSchedule(input),all=scheduleRows(await read('JADWAL'));
    if(!rows(await read('KELAS')).some(r=>r[0]===v.classId&&r[9]!=='TIDAK'))throw new Error('Kelas tidak aktif.');
    if(v.teacherId!=='ADMIN'&&!rows(await read('GURU')).some(r=>r[0]===v.teacherId&&r[3]==='YA'))throw new Error('Guru tidak aktif.');
    const old=all.find(s=>s.id===input.id);
    if(input.id&&!old)throw new Error('Jadwal tidak ditemukan.');
    if(old&&old.status==='TERBIT'&&old.from<=witaDay(db.nowMs()))throw new Error('Jadwal yang sudah berlaku tidak dapat diubah. Akhiri masa berlaku lalu buat jadwal pengganti.');
    if(v.from<witaDay(db.nowMs()))throw new Error('Jadwal baru tidak dapat dimulai pada tanggal lampau.');
    if(all.some(s=>s.id!==input.id&&scheduleConflict(v,s)))throw new Error('Jadwal berbenturan dengan kelas atau guru pada waktu yang sama.');
    const id=old?.id||'JDL-'+crypto.randomUUID();
    await db.appendRows('JADWAL',[[id,v.classId,v.teacherId,v.subject,v.weekday,v.start,v.end,v.room,v.from,v.until,v.status,p.id||'ADMIN',db.nowMs()]]);
    return {ok:true,id};
  }
  async function endSchedule(p,input){
    await admin(p);await ready();
    const s=scheduleRows(await read('JADWAL')).find(s=>s.id===input.id),until=norm(input.until);
    if(!s||s.status!=='TERBIT')throw new Error('Jadwal terbit tidak ditemukan.');
    if(!validDay(until)||until<witaDay(db.nowMs())||until<s.from||until>=s.until)throw new Error('Tanggal akhir harus hari ini atau setelahnya, dan lebih awal dari akhir jadwal lama.');
    await db.appendRows('JADWAL',[[s.id,s.classId,s.teacherId,s.subject,s.weekday,s.start,s.end,s.room,s.from,until,s.status,p.id||'ADMIN',db.nowMs()]]);
    return {ok:true};
  }
  async function meeting(input){
    if(!validDay(norm(input.date)))throw new Error('Tanggal tidak valid.');
    const all=scheduleRows(await read('JADWAL')),exceptions=await read('JADWAL_PENGECUALIAN');
    const m=occurrences(all,exceptions,input.date,input.date).find(s=>s.id===input.id);
    if(!m)throw new Error('Pertemuan tidak ditemukan.');return m;
  }
  async function cancelMeeting(p,input){
    await admin(p);await ready();const m=await meeting(input),note=norm(input.note);
    if(!note||note.length>300)throw new Error('Isi alasan pembatalan (maksimal 300 karakter).');
    if(input.date<witaDay(db.nowMs()))throw new Error('Pertemuan lampau tidak dapat dibatalkan.');
    if(rows(await read('ABSENSI_SESI')).some(r=>r[0]===m.sessionId))throw new Error('Absensi sudah dibuat. Koreksi kehadiran melalui menu Kehadiran.');
    if(!m.cancelled)await db.appendRows('JADWAL_PENGECUALIAN',[[m.id,input.date,note,p.id||'ADMIN',db.nowMs()]]);
    return {ok:true};
  }
  async function openMeeting(p,input){
    await admin(p);await ready();const m=await meeting(input);
    if(m.cancelled)throw new Error('Pertemuan dibatalkan.');
    if(input.date!==witaDay(db.nowMs()))throw new Error('Absensi jadwal hanya dapat dibuka untuk hari ini (WITA).');
    const sessions=rows(await read('ABSENSI_SESI')),existing=sessions.find(r=>r[0]===m.sessionId);
    if(existing)return {ok:true,sessionId:m.sessionId,closed:existing[6]==='TUTUP'};
    if(sessions.some(r=>r[1]===m.classId&&r[6]==='BUKA'))throw new Error('Tutup sesi absensi aktif kelas ini terlebih dahulu.');
    const c=rows(await read('KELAS')).find(r=>r[0]===m.classId&&r[9]!=='TIDAK');
    if(!c)throw new Error('Kelas tidak aktif.');
    const students=rows(await read('SISWA')).filter(r=>r[5]==='YA'&&r[6]===m.classId);
    if(!students.length)throw new Error('Kelas belum memiliki siswa aktif.');
    const oldRoster=rows(await read('ABSENSI_PESERTA')).filter(r=>r[0]===m.sessionId);
    const missing=students.filter(s=>!oldRoster.some(r=>r[1]===s[0]));
    // Roster first: if writing the session fails, a retry safely reuses these records.
    if(missing.length)await db.appendRows('ABSENSI_PESERTA',missing.map(r=>[m.sessionId,r[0],r[1],m.classId,r[3]]));
    await db.appendRows('ABSENSI_SESI',[[m.sessionId,m.classId,c[1],m.subject+' · '+input.date,db.nowMs(),'','BUKA']]);
    return {ok:true,sessionId:m.sessionId};
  }
  async function dashboard(p,input={}){
    if(!['S','A'].includes(p.role))throw new Error('Akses ditolak.');
    let student;
    if(p.role==='A')await admin(p);else{
      student=rows(await read('SISWA')).find(r=>r[0]===p.id&&r[5]==='YA');
      if(!student)throw new Error('Akun siswa tidak aktif.');
    }
    const [sched,exc,roster]=await Promise.all(['JADWAL','JADWAL_PENGECUALIAN','PESERTA_UJIAN'].map(s=>optionalAcademicRows(db,s)));
    const from=input.from||witaDay(db.nowMs()-7*86400000),until=input.until||witaDay(db.nowMs()+62*86400000);
    const all=scheduleRows(sched),visible=all.filter(s=>p.role==='A'||(s.classId===student[6]&&s.status==='TERBIT'));
    return {ready:!!(sched&&exc&&roster),schedules:visible,meetings:occurrences(visible,exc,from,until),todayMeetings:occurrences(visible,exc,witaDay(db.nowMs()),witaDay(db.nowMs())),
      rosters:p.role==='A'?latestRosters(roster):undefined,
      teachers:[{id:'ADMIN',name:'Admin utama'},...rows(await read('GURU')).filter(r=>r[3]==='YA'&&(p.role==='A'||visible.some(s=>s.teacherId===r[0]))).map(r=>({id:r[0],name:r[1]}))]};
  }
  return {saveRoster,saveSchedule,endSchedule,cancelMeeting,openMeeting,dashboard};
}
export const academic=createAcademicService();
