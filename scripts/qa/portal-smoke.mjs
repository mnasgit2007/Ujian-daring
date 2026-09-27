// Browser acceptance checks with synthetic data only. No external API credentials.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root=path.resolve('public'),output=path.resolve('qa-output');
await fs.mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(relative==='/'?'/index.html':relative));
    if(!file.startsWith(root+path.sep))throw Error('outside root');
    const body=await fs.readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(body);
  }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const now=Date.now(),day=n=>new Date(n+28800000).toISOString().slice(0,10),today=day(now),date=n=>new Date(n+28800000).toISOString().slice(0,19).replace('T',' ');
const classes=[{id:'K1',name:'XI DKV',grade:'XI',program:'DKV',year:'2026/2027',semester:'Ganjil',group:'1',homeroom:'Guru DKV',teachers:'Guru DKV',active:true,studentCount:2,source:'catalog'},{id:'K2',name:'XI ATR',grade:'XI',program:'ATR',year:'2026/2027',semester:'Ganjil',group:'1',homeroom:'Guru ATR',teachers:'Guru ATR',active:true,studentCount:1,source:'catalog'}];
const students=[{id:'S1',name:'Siswa Uji DKV',kelas:'XI DKV',kelompok:'1',classId:'K1',active:true,hasQr:true},{id:'S2',name:'Siswa Kedua DKV',kelas:'XI DKV',kelompok:'2',classId:'K1',active:true,hasQr:true},{id:'S3',name:'Siswa Uji ATR',kelas:'XI ATR',kelompok:'1',classId:'K2',active:true,hasQr:true}];
const exams=[{id:'E1',title:'Prinsip Dasar Desain',duration:45,start:date(now-3600000),end:date(now+86400000),status:'BUKA',state:'TERSEDIA',score:null,maxScore:null,sessionPin:'',sessionPinRequired:false},{id:'E2',title:'Literasi Visual',duration:30,start:date(now-86400000*3),end:date(now-86400000*2),status:'TUTUP',state:'SELESAI',score:85,maxScore:100,submittedMs:now-86400000*2,sessionPin:'',sessionPinRequired:false}];
function fixture(){
  const core={exams:structuredClone(exams),students:structuredClone(students),classes:structuredClone(classes),classHistory:[],attendanceSessions:[],attendanceRecords:[],attempts:[{examId:'E2',studentId:'S1',attemptId:'A1',status:'SELESAI',start:date(now-86400000*3),lastSaved:date(now-86400000*2),submitted:date(now-86400000*2),revision:1,score:85,maxScore:100}],examRosters:{E1:{classIds:['K1'],studentIds:['S1','S2']},E2:{classIds:['K1'],studentIds:['S1','S2']}},refreshed:date(now)};
  const profile={S:{id:'S1',name:'Siswa Uji DKV',officialName:'Siswa Uji DKV',email:'',phone:'',bio:'Belajar membuat desain yang menyampaikan pesan.',subject:'',className:'XI DKV',group:'1'},A:{id:'ADMIN',name:'Guru Uji',officialName:'Guru Uji',email:'',phone:'',bio:'Mendampingi siswa SMKN 1 Manggelewa.',subject:'Desain Komunikasi Visual',className:'',group:''}};
  const tasks=[{id:'T1',classId:'K1',title:'Satu Pesan Tiga Susunan',instructions:'Foto hasil sketsa dan kumpulkan.',due:now+3600000,allowLate:true,status:'TERBIT'},{id:'T2',classId:'K1',title:'Analisis Poster',instructions:'Jelaskan titik fokus poster.',due:now-86400000,status:'TERBIT',allowLate:true}];
  const submissions=[{id:'P1',taskId:'T2',studentId:'S1',name:'Siswa Uji DKV',note:'Tugas selesai',files:[],submittedMs:now-86400000,late:false,score:90,feedback:'Komposisi sudah jelas.'}];
  const attendance=['HADIR','IZIN','SAKIT','ALPA','TERLAMBAT','BELUM_DICATAT'].map((status,i)=>({sessionId:'ABS'+i,studentId:'S1',name:'Siswa Uji DKV',classId:'K1',className:'XI DKV',group:'1',title:'Pertemuan '+(i+1),dateMs:now-(i+1)*86400000,status,sessionStatus:status==='BELUM_DICATAT'?'BUKA':'TUTUP',note:'',updatedMs:now-(i+1)*86400000}));
  const schedule={id:'J1',classId:'K1',teacherId:'G1',subject:'Desain Komunikasi Visual',weekday:new Date(today+'T00:00Z').getUTCDay(),start:'08:00',end:'09:30',room:'Lab DKV',from:today,until:day(now+86400000*60),status:'TERBIT'};
  const meeting={...schedule,date:today,startMs:now,endMs:now+5400000,sessionId:'JAD-fixture',cancelled:false,note:''};
  const academic={ready:true,schedules:[schedule],meetings:[meeting],todayMeetings:[meeting],teachers:[{id:'ADMIN',name:'Admin utama'},{id:'G1',name:'Guru DKV'}]};
  const requests=[];
  const learning=r=>({profile:profile[r],photo:'',photoEnabled:true,classes:r==='A'?classes:classes.slice(0,1),students:r==='A'?students:[],teachers:[],canManageTeachers:r==='A',materials:[{id:'M1',classId:'K1',title:'Elemen Dasar Desain',topic:'Pertemuan 3',content:'Titik, garis, bentuk, dan ruang.',link:'',status:'TERBIT'}],tasks,submissions,attendance,sessions:[],uploadConfigured:true});
  const dashboard=r=>r==='A'?core:{student:students[0],exams:core.exams};
  return {core,requests,academic,async route(route){
    const req=route.request(),url=new URL(req.url()),b=req.postDataJSON()||{},r=b.token==='fixture-A'||b.role==='admin'?'A':'S';requests.push({path:url.pathname,...b});let data;
    if(url.pathname==='/api/login')data={token:'fixture-'+r,...dashboard(r)};
    else if(url.pathname==='/api/dashboard')data=dashboard(r);
    else if(url.pathname==='/api/learning'){
      if(b.action==='dashboard')data=learning(r);
      else if(b.action==='academic')data=academic;
      else if(b.action==='saveProfile'){Object.assign(profile[r],{name:b.name,email:b.email,phone:b.phone,bio:b.bio,subject:b.subject});data={ok:true};}
      else if(b.action==='saveRoster'){core.examRosters[b.examId]={classIds:b.classIds,studentIds:b.studentIds};data={ok:true};}
      else if(b.action==='saveSchedule'){academic.schedules.push({...b,id:'J2',weekday:Number(b.weekday)});data={ok:true,id:'J2'};}
      else if(b.action==='openMeeting'){core.attendanceSessions=[{id:'JAD-fixture',classId:'K1',className:'XI DKV',title:'Desain Komunikasi Visual',opened:date(now),status:'BUKA',presentCount:0}];data={ok:true,sessionId:'JAD-fixture'};}
      else throw Error('Unexpected learning action: '+b.action);
    }else throw Error('Unexpected API: '+url.pathname);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  }};
}
const browser=await chromium.launch({headless:true});
const report=[];
async function checkOverflow(page,label){
  const size=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth}));
  assert.ok(size.content<=size.viewport+1,label+' has horizontal overflow: '+JSON.stringify(size));
}
async function scenario(r,width){
  const f=fixture(),errors=[],context=await browser.newContext({viewport:{width,height:1000},timezoneId:'Asia/Makassar'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',route=>f.route(route));
  try{
    await page.goto(origin);
    if(r==='A')await page.locator('#adminTab').click();else await page.locator('#userId').fill('S1');
    await page.locator('#password').fill('fixture-only');await page.locator('#loginBtn').click();
    const nav=key=>page.locator(`[data-lp-role="${r}"][data-lp-page="${key}"]`);
    await page.locator('.p-hero:visible').waitFor();await page.locator('.p-calendar:visible').waitFor();
    assert.equal(await page.locator('.p-metric:visible').count(),4);await checkOverflow(page,r+' dashboard '+width);
    await page.screenshot({path:path.join(output,r+'-dashboard-'+width+'.png'),fullPage:true});
    await nav('profile').click();await page.locator('.p-identity:visible').waitFor();await checkOverflow(page,r+' profile '+width);
    await page.screenshot({path:path.join(output,r+'-profile-'+width+'.png'),fullPage:true});
    await page.locator('#pEditProfile').click();await page.locator('#lpProfileForm [name=name]').fill('Nama Profil Uji');await page.locator('#lpProfileForm').getByRole('button',{name:'Simpan profil'}).click();
    await page.locator('.p-identity h2').filter({hasText:'Nama Profil Uji'}).waitFor();
    for(const key of ['materials','tasks','attendance']){await nav(key).click();await page.locator('#lpPanel'+r+' .lp-item').first().waitFor();await checkOverflow(page,r+' '+key+' '+width);}
    await nav('schedule').click();await page.locator('.p-schedule-item:visible').first().waitFor();await checkOverflow(page,r+' schedule '+width);
    await page.locator('#pAgendaMode').click();await page.locator('.p-calendar-events .p-event').first().waitFor();await page.locator('#pMonthMode').click();
    if(r==='A'){
      await page.locator('#pNewSchedule').click();await page.locator('#pScheduleForm [name=subject]').fill('Praktik Visual');await page.locator('#pScheduleForm [name=start]').fill('10:00');await page.locator('#pScheduleForm [name=end]').fill('11:00');await page.locator('#pScheduleForm [name=until]').fill(day(now+86400000*30));await page.locator('#pScheduleForm [type=submit]').click();
      await page.locator('.p-schedule-item h4').filter({hasText:'Praktik Visual'}).waitFor();
      await page.locator('[data-open-meeting]').first().click();await page.locator('#adminAttendancePage:not(.hidden)').waitFor();
      assert.ok(f.requests.some(x=>x.action==='openMeeting'&&x.id==='J1'&&x.date===today));
      await page.locator('#adminClassesNav').click();
      for(const tab of ['placement','history','catalog']){await page.locator(`[data-class-tab="${tab}"]`).click();assert.equal(await page.locator(`[data-class-tab="${tab}"]`).getAttribute('aria-selected'),'true');await checkOverflow(page,'class '+tab+' '+width);}
      await page.locator('#adminMonitorNav').click();await page.locator('#pRosterPanel summary').click();
      await page.locator('#pRosterStudents [value=S2]').uncheck();await page.locator('#pRosterForm [type=submit]').click();
      await page.locator('#pRosterPanel summary').filter({hasText:'Peserta: 1 siswa'}).waitFor();
      assert.deepEqual(f.requests.findLast(x=>x.action==='saveRoster').studentIds,['S1']);
      await checkOverflow(page,'monitor '+width);await page.screenshot({path:path.join(output,'A-monitor-'+width+'.png'),fullPage:true});
    }else{
      await page.locator('.student-rail a[href="#examList"]').click();await page.locator('#examList:visible').waitFor();assert.equal(await page.locator('#examList h3').count(),2);await checkOverflow(page,'student exams '+width);
    }
    assert.deepEqual(errors,[],'browser errors');report.push({role:r,width,status:'passed',apiRequests:f.requests.length});
  }catch(e){await page.screenshot({path:path.join(output,r+'-failure-'+width+'.png'),fullPage:true});report.push({role:r,width,status:'failed',error:e.stack,pageErrors:errors});throw e;}
  finally{await context.close();}
}
try{for(const r of ['S','A'])for(const width of [1440,390])await scenario(r,width);console.log(JSON.stringify(report,null,2));}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
