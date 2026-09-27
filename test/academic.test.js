import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcademicService, eligibleForExam, latestRosters, normalizeSchedule, occurrences, optionalAcademicRows, scheduleConflict, uniqueAttempts, witaDay } from '../api/_lib/academic.js';
import { createLearningService, buildAttendance } from '../api/_lib/learning.js';
import { HEADERS } from '../api/_lib/store.js';

const admin={role:'A'},student={role:'S',id:'S1'};
const clock=Date.parse('2026-09-28T08:00:00+08:00');
const schedule={classId:'K1',teacherId:'G1',subject:'Desain Komunikasi Visual',weekday:1,start:'08:00',end:'09:30',room:'Lab DKV',from:'2026-09-28',until:'2026-12-21',status:'TERBIT'};
function fixture(){
  const tables=Object.fromEntries(Object.entries(HEADERS).map(([s,h])=>[s,[[...h]]]));
  tables.KELAS.push(['K1','XI DKV','','','','','','','','YA'],['K2','XI ATR','','','','','','','','YA']);
  tables.SISWA.push(['S1','Ani','XI DKV','1','secret','YA','K1'],['S2','Budi','XI ATR','1','secret','YA','K2'],['S3','Nonaktif','XI DKV','1','secret','TIDAK','K1']);
  tables.GURU.push(['G1','Guru DKV','private-hash','YA'],['G2','Guru ATR','private-hash','YA']);
  tables.UJIAN.push(['E1','Ujian DKV']);
  const db={nowMs:()=>clock,async preload(){},async readRows(s){if(!tables[s])throw Error('Unable to parse range');return structuredClone(tables[s]);},async appendRows(s,r){tables[s].push(...structuredClone(r));}};
  return {db,tables,service:createAcademicService(db)};
}

test('missing optional tabs preserve legacy exams, but auth/network failures do not fail open',async()=>{
  const {db,tables}=fixture();delete tables.PESERTA_UJIAN;
  assert.equal(await optionalAcademicRows(db,'PESERTA_UJIAN'),null);
  assert.equal(eligibleForExam(latestRosters(null),'E1','S1'),true);
  await assert.rejects(optionalAcademicRows({readRows:async()=>{throw Error('permission denied');}},'PESERTA_UJIAN'),/permission/);
});
test('explicit rosters enforce active class membership and freeze even after reset',async()=>{
  const {service,tables}=fixture();const v={examId:'E1',classIds:['K1'],studentIds:['S1','S1']};
  await assert.rejects(service.saveRoster(student,v),/guru/);
  await assert.rejects(service.saveRoster(admin,{...v,studentIds:['S2']}),/kelas/);
  await assert.rejects(service.saveRoster(admin,{...v,studentIds:['S3']}),/aktif/);
  await service.saveRoster(admin,v);const roster=latestRosters(tables.PESERTA_UJIAN);
  assert.deepEqual(roster.E1.studentIds,['S1']);assert.equal(eligibleForExam(roster,'E1','S1'),true);assert.equal(eligibleForExam(roster,'E1','S2'),false);
  tables.SESI.push(['ATT1','E1','S1',clock,clock,'RESET']);await assert.rejects(service.saveRoster(admin,v),/percobaan/);
});
test('attempt summaries count a student once and omit reset history',()=>{
  assert.equal(uniqueAttempts([{examId:'E1',studentId:'S1',status:'RESET'},{examId:'E1',studentId:'S1',status:'SEDANG'},{examId:'E1',studentId:'S1',status:'SELESAI'}]).length,1);
});
test('schedule validation and conflict detection consider teacher, class, weekday and effective dates',()=>{
  assert.throws(()=>normalizeSchedule({...schedule,end:'07:00'}),/valid/);
  assert.throws(()=>normalizeSchedule({...schedule,from:'2026-02-30'}),/valid/);
  assert.equal(scheduleConflict(schedule,{...schedule,classId:'K2'}),true);
  assert.equal(scheduleConflict(schedule,{...schedule,teacherId:'G2'}),true);
  assert.equal(scheduleConflict(schedule,{...schedule,classId:'K2',teacherId:'G2'}),false);
  assert.equal(scheduleConflict(schedule,{...schedule,start:'09:30',end:'10:30'}),false);
  assert.equal(scheduleConflict(schedule,{...schedule,from:'2026-09-29',until:'2026-10-04'}),false);
  assert.equal(scheduleConflict(schedule,{...schedule,status:'DRAF'}),false);
});
test('calendar uses WITA, bounds requests and preserves stable occurrence identity',()=>{
  assert.equal(witaDay(Date.parse('2026-09-27T17:00:00Z')),'2026-09-28');
  const s={...schedule,id:'J1'},exc=[HEADERS.JADWAL_PENGECUALIAN,['J1','2026-10-05','Libur sekolah']];
  const m=occurrences([s],exc,'2026-09-28','2026-10-05');assert.equal(m.length,2);assert.equal(m[0].startMs,clock);assert.equal(m[1].cancelled,true);
  assert.equal(m[1].sessionId,occurrences([s],exc,'2026-10-05','2026-10-05')[0].sessionId);
  assert.throws(()=>occurrences([s],exc,'2026-01-01','2026-12-31'),/93/);
});
test('student calendar returns only published schedules for its class and public teacher names',async()=>{
  const {service}=fixture();await service.saveSchedule(admin,schedule);
  await service.saveSchedule(admin,{...schedule,classId:'K2',teacherId:'G2'});
  await service.saveSchedule(admin,{...schedule,subject:'Draf privat',status:'DRAF'});
  const d=await service.dashboard(student);assert.equal(d.schedules.length,1);assert.equal(d.schedules[0].classId,'K1');assert.equal(d.rosters,undefined);
  assert.deepEqual(d.teachers.map(t=>t.id),['ADMIN','G1']);assert.ok(!JSON.stringify(d).includes('private-hash'));assert.ok(!JSON.stringify(d).includes('Draf privat'));
  await assert.rejects(service.saveSchedule(student,schedule),/guru/);await assert.rejects(service.endSchedule(student,{}),/guru/);
});
test('ending a recurring schedule preserves old meetings and allows a replacement after the end',async()=>{
  const {service}=fixture();const {id}=await service.saveSchedule(admin,schedule);
  await assert.rejects(service.saveSchedule(admin,{...schedule,id,start:'08:30'}),/sudah berlaku/);
  await assert.rejects(service.endSchedule(admin,{id,until:'2026-09-27'}),/akhir/);
  await service.endSchedule(admin,{id,until:'2026-10-05'});
  await service.saveSchedule(admin,{...schedule,from:'2026-10-06',start:'08:30'});
  const d=await service.dashboard(student,{from:'2026-09-28',until:'2026-10-12'});
  assert.deepEqual(d.meetings.map(m=>[m.date,m.start]),[['2026-09-28','08:00'],['2026-10-05','08:00'],['2026-10-12','08:30']]);
});
test('opening a scheduled meeting snapshots active students, reuses its session and preserves closed attendance',async()=>{
  const {service,tables}=fixture();const {id}=await service.saveSchedule(admin,schedule),v={id,date:'2026-09-28'};
  await assert.rejects(service.openMeeting(student,v),/guru/);
  await assert.rejects(service.openMeeting(admin,{id,date:'2026-10-05'}),/hari ini/);
  const a=await service.openMeeting(admin,v),b=await service.openMeeting(admin,v);assert.equal(a.sessionId,b.sessionId);assert.equal(tables.ABSENSI_SESI.length,2);assert.equal(tables.ABSENSI_PESERTA.length,2);
  assert.equal(tables.ABSENSI_PESERTA[1][1],'S1');tables.ABSENSI_SESI[1][6]='TUTUP';
  assert.equal((await service.openMeeting(admin,v)).closed,true);assert.equal(tables.ABSENSI_SESI.length,2);
  await assert.rejects(service.cancelMeeting(admin,{...v,note:'Libur'}),/sudah dibuat/);
});
test('retry after a session-write failure does not duplicate the scheduled roster',async()=>{
  const {db,service,tables}=fixture();const {id}=await service.saveSchedule(admin,schedule),append=db.appendRows;let fail=true;
  db.appendRows=async(s,r)=>{if(s==='ABSENSI_SESI'&&fail){fail=false;throw Error('temporary write failure');}return append(s,r);};
  await assert.rejects(service.openMeeting(admin,{id,date:'2026-09-28'}),/temporary/);
  await service.openMeeting(admin,{id,date:'2026-09-28'});assert.equal(tables.ABSENSI_PESERTA.length,2);assert.equal(tables.ABSENSI_SESI.length,2);
});
test('cancelled meetings cannot open attendance and do not generate absences',async()=>{
  const {service,tables}=fixture();const {id}=await service.saveSchedule(admin,schedule),v={id,date:'2026-09-28',note:'Libur sekolah'};
  await assert.rejects(service.cancelMeeting(student,v),/guru/);await service.cancelMeeting(admin,v);await service.cancelMeeting(admin,v);
  assert.equal(tables.JADWAL_PENGECUALIAN.length,2);await assert.rejects(service.openMeeting(admin,v),/dibatalkan/);
  assert.deepEqual(buildAttendance(tables.ABSENSI_SESI,tables.ABSENSI,tables.ABSENSI_DETAIL,tables.ABSENSI_PESERTA,tables.SISWA),[]);
});
test('profile thumbnails are bounded and keyed to the authenticated account',async()=>{
  const {db,tables}=fixture(),service=createLearningService(db,{}),photo='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,1,2,3]).toString('base64');
  await service.savePhoto(student,{photo,id:'S2'});assert.equal(tables.FOTO_PROFIL[1][0],'S:S1');
  assert.equal((await service.dashboard(student)).photo,photo);assert.equal((await service.dashboard({role:'S',id:'S2'})).photo,'');
  await assert.rejects(service.savePhoto(student,{photo:'data:image/svg+xml;base64,AAAA'}),/foto|JPEG/i);
  await assert.rejects(service.savePhoto(student,{photo:'data:image/jpeg;base64,'+'A'.repeat(33000)}),/foto|besar|JPEG/i);
});
