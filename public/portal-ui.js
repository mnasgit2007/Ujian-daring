/* Overview layer. Existing exam runner, uploads and attendance controls remain in place. */
(() => {
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const day=ms=>new Date(ms+28800000).toISOString().slice(0,10);
  const parse=s=>s==null||s===''?NaN:Number.isFinite(Number(s))?Number(s):Date.parse(String(s).replace(' ','T')+'+08:00');
  const fmt=n=>Number.isFinite(n)?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Makassar',dateStyle:'medium',timeStyle:'short'}).format(n):'—';
  const labels={HADIR:'Hadir',TERLAMBAT:'Terlambat',IZIN:'Izin',SAKIT:'Sakit',ALPA:'Alpa',BELUM_DICATAT:'Belum dicatat'};
  const colors={HADIR:'#19856c',TERLAMBAT:'#b17912',IZIN:'#3879c2',SAKIT:'#9175c9',ALPA:'#cf4c48'};
  const done=s=>['SELESAI','WAKTU_HABIS'].includes(s);
  const icons={dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',schedule:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2',attendance:'M5 4h14v17H5z M9 2h6v4H9z M8 13l3 3 5-6',materials:'M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z M12 6v15',tasks:'M5 3h10l4 4v14H5z M15 3v5h4 M8 12h8 M8 16h5',profile:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',monitor:'M3 4h18v13H3z M8 21h8 M12 17v4 M6 12l3-4 4 5 4-6',classes:'M3 9l9-6 9 6-9 6z M6 12v6l6 3 6-3v-6',arrow:'M5 12h14 M13 6l6 6-6 6'};
  icons.exams=icons.monitor;
  const icon=k=>`<svg class="p-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[k]||icons.tasks}"/></svg>`;
  let coreData={},learning=null,academic=null,role='',token='',pageName='',host=null,academicError='',request=0,filter={classId:'',period:'30',teacherId:''},month=day(Date.now()).slice(0,7),selectedDay=day(Date.now()),calendarMode='month',classTab='catalog';
  const empty=t=>`<div class="p-empty">${esc(t)}</div>`;
  const cls=id=>learning?.classes.find(c=>c.id===id)?.name||id;
  const teacher=id=>academic?.teachers.find(t=>t.id===id)?.name||(id==='ADMIN'?'Admin utama':id);
  async function api(action,body={}){
    const res=await fetch('/api/learning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,action,token:S.token})});
    const data=await res.json();if(!res.ok)throw Error(data.error||'Permintaan gagal.');return data;
  }
  let toastTimer;
  function feedback(message,bad=false){let n=$('pToast');if(!n){n=document.createElement('div');n.id='pToast';n.setAttribute('role','status');n.setAttribute('aria-live','polite');document.body.append(n);}n.hidden=false;n.textContent=message;n.className='p-toast'+(bad?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.hidden=true,8000);}
  async function action(button,fn){const original=button.textContent;button.disabled=true;button.textContent='Menyimpan…';try{await fn();await window.LearningUI.reload();}catch(e){feedback(e.message,true);}finally{if(button.isConnected){button.disabled=false;button.textContent=original;}}}
  function scope(){
    const start=filter.period==='all'?0:Date.parse(day(Date.now()-(Number(filter.period)-1)*86400000)+'T00:00:00+08:00'), classMatch=id=>!filter.classId||id===filter.classId;
    const tasks=learning.tasks.filter(t=>classMatch(t.classId)&&t.status==='TERBIT'&&t.due>=start);
    const submissions=new Map();learning.submissions.forEach(s=>{if(tasks.some(t=>t.id===s.taskId))submissions.set(s.taskId+':'+s.studentId,s);});
    const att=learning.attendance.filter(a=>classMatch(a.classId)&&a.dateMs>=start&&a.dateMs<=Date.now());
    const counts=Object.fromEntries(Object.keys(labels).map(s=>[s,0]));att.forEach(a=>counts[a.status]++);
    const recorded=att.filter(a=>a.status!=='BELUM_DICATAT').length,present=counts.HADIR+counts.TERLAMBAT;
    const core=coreData[role]||{exams:[]};
    const exams=(core.exams||[]).filter(e=>parse(e.end)>=start&&(role==='S'||!filter.classId||core.examRosters?.[e.id]?.classIds.includes(filter.classId)));
    const attempts=new Map();(core.attempts||[]).forEach(a=>{if(a.status!=='RESET'&&exams.some(e=>e.id===a.examId))attempts.set(a.examId+':'+a.studentId,a);});
    const complete=role==='S'?exams.filter(e=>done(e.state)).length:[...attempts.values()].filter(a=>done(a.status)).length;
    const students=(learning.students||[]).filter(s=>classMatch(s.classId));
    const expected=role==='S'?tasks.length:tasks.reduce((n,t)=>n+students.filter(s=>s.classId===t.classId).length,0);
    return {tasks,submissions:[...submissions.values()],att,counts,recorded,present,percent:recorded?Math.round(present/recorded*100):null,exams,attempts:[...attempts.values()],complete,students,expected};
  }
  const choice=(values,selected)=>values.map(([v,l])=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(l)}</option>`).join('');
  function filters(){return `<div class="p-filters">${role==='A'?`<label>Kelas<select id="pClass">${choice([['','Semua kelas'],...learning.classes.map(c=>[c.id,c.name])],filter.classId)}</select></label>`:''}<label>Periode ringkasan<select id="pPeriod">${choice([['7','7 hari terakhir'],['30','30 hari terakhir'],['90','90 hari terakhir'],['all','Semua periode']],filter.period)}</select></label><span>Kehadiran mengikuti periode; tugas/ujian juga mencakup jadwal mendatang. WITA.</span></div>`;}
  function bindFilters(){if($('pClass'))$('pClass').onchange=e=>{filter.classId=e.target.value;remember();renderCurrent();};if($('pPeriod'))$('pPeriod').onchange=e=>{filter.period=e.target.value;remember();renderCurrent();};}
  function remember(){try{sessionStorage.setItem('PORTAL_FILTERS',JSON.stringify(filter));}catch{}}
  function metric(title,value,caption,type){return `<button type="button" class="p-metric" data-open="${type}"><span>${icon(type)} ${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(caption)} ${icon('arrow')}</small></button>`;}
  function attendanceChart(s){
    let pos=0;const stops=[];for(const [status,color] of Object.entries(colors)){const start=pos;pos+=s.recorded?s.counts[status]/s.recorded*100:0;stops.push(`${color} ${start}% ${pos}%`);}
    return `<article class="p-card"><div class="p-card-head"><h3>Kehadiran</h3><button class="secondary smallbtn" data-open="attendance">Rincian</button></div><div class="p-att-chart"><div class="p-donut" style="background:conic-gradient(${s.recorded?stops.join(','):'#edf0f4 0% 100%'})" role="img" aria-label="Kehadiran ${s.percent===null?'belum tercatat':s.percent+' persen'}"><div><strong>${s.percent===null?'—':s.percent+'%'}</strong><small>hadir / terlambat</small></div></div><ul class="p-legend">${Object.keys(colors).map(k=>`<li><i style="background:${colors[k]}"></i>${labels[k]}<strong>${s.counts[k]}</strong></li>`).join('')}</ul></div><p class="p-caption">${s.recorded} catatan final · ${s.counts.BELUM_DICATAT} belum dicatat tidak masuk persentase.</p></article>`;
  }
  function taskChart(s){
    const graded=s.submissions.filter(x=>x.score!==null).length,pending=s.submissions.length-graded,missing=Math.max(0,s.expected-s.submissions.length),total=graded+pending+missing;
    return `<article class="p-card"><div class="p-card-head"><h3>Penyelesaian tugas</h3>${icon('tasks')}</div><strong class="p-big">${s.submissions.length}<small> / ${s.expected} ${role==='A'?'pengumpulan yang diharapkan':'tugas'}</small></strong><div class="p-segments">${[[graded,'#7c68cc'],[pending,'#fe7154'],[missing,'#e9edf3']].map(([n,c])=>`<span style="width:${total?n/total*100:0}%;background:${c}"></span>`).join('')}</div><div class="p-task-counts"><span><b>${missing}</b>Belum dikumpulkan</span><span><b>${pending}</b>Belum dinilai</span><span><b>${graded}</b>Dinilai</span></div><p class="p-caption">Versi terbaru tiap siswa/tugas. ${role==='A'?'Target mengikuti siswa aktif pada kelas saat ini.':'Pengiriman ulang dihitung satu tugas.'}</p><button class="secondary" data-open="tasks">${role==='A'?'Periksa pengumpulan':'Buka tugas'}</button></article>`;
  }
  function weekChart(s){
    const now=Date.now(),weeks=Array.from({length:4},(_,i)=>({start:now-(4-i)*7*86400000,end:now-(3-i)*7*86400000}));
    const values=weeks.map(w=>({tasks:s.submissions.filter(x=>x.submittedMs>=w.start&&x.submittedMs<w.end).length,exams:role==='A'?s.attempts.filter(a=>done(a.status)&&parse(a.submitted)>=w.start&&parse(a.submitted)<w.end).length:s.exams.filter(e=>done(e.state)&&e.submittedMs>=w.start&&e.submittedMs<w.end).length}));
    const max=Math.max(1,...values.flatMap(v=>[v.tasks,v.exams||0]));
    return `<article class="p-card"><h3>Pengumpulan per minggu</h3><p class="p-caption">Empat minggu terakhir; mengikuti filter kelas dan periode. Satu versi terakhir per tugas/siswa.</p><div class="p-week-chart">${values.map((v,i)=>`<div><div class="p-bars"><span style="height:${v.tasks/max*100}%" title="${v.tasks} pengumpulan"><b>${v.tasks}</b></span>${v.exams!==null?`<span class="p-exam-bar" style="height:${v.exams/max*100}%" title="${v.exams} ujian selesai"><b>${v.exams}</b></span>`:''}</div><small>${day(weeks[i].start).slice(5)}</small></div>`).join('')}</div><p class="p-caption">Ungu: tugas · Coral: ujian selesai</p></article>`;
  }
  function upcoming(){
    const submitted=new Set(learning.submissions.map(s=>s.taskId));
    return learning.tasks.filter(t=>t.status==='TERBIT'&&(!filter.classId||t.classId===filter.classId)&&(role==='A'||!submitted.has(t.id))).sort((a,b)=>a.due-b.due);
  }
  function examChart(s){
    const total=role==='S'?s.exams.length:s.attempts.length,finished=s.complete,active=role==='S'?s.exams.filter(e=>e.state==='LANJUTKAN').length:s.attempts.filter(a=>a.status==='SEDANG').length,rest=Math.max(0,total-finished-active);
    return `<article class="p-card"><div class="p-card-head"><h3>Progres ujian</h3>${icon('monitor')}</div><strong class="p-big">${finished}<small> ${role==='S'?'dari '+total+' ujian':'percobaan selesai'}</small></strong><div class="p-segments">${[[finished,'#ee8a70'],[active,'#e6bf65'],[rest,'#e9edf3']].map(([v,c])=>`<span style="width:${total?v/total*100:0}%;background:${c}"></span>`).join('')}</div><div class="p-task-counts"><span><b>${finished}</b>Selesai / waktu habis</span><span><b>${active}</b>Mengerjakan</span><span><b>${rest}</b>${role==='S'?'Belum selesai':'Status lain'}</span></div><p class="p-caption">${role==='S'?'Mencakup ujian yang ditugaskan, ujian terbuka, dan riwayat.':'Satu percobaan terbaru per siswa/ujian. Jumlah peserta terdaftar tersedia pada Monitor Ujian.'}</p><button class="secondary" data-open="exams">${role==='S'?'Lihat ujian':'Monitor ujian'}</button></article>`;
  }
  function events(){
    const core=coreData[role]||{},submitted=new Set(learning.submissions.map(s=>s.taskId)),out=[];
    learning.tasks.filter(t=>t.status==='TERBIT'&&(!filter.classId||t.classId===filter.classId)).forEach(t=>out.push({date:day(t.due),time:t.due,title:t.title,type:'tasks',label:role==='S'&&submitted.has(t.id)?'Sudah dikumpulkan':'Tenggat tugas',detail:cls(t.classId),id:t.id}));
    (core.exams||[]).filter(e=>role==='S'||!filter.classId||core.examRosters?.[e.id]?.classIds.includes(filter.classId)).forEach(e=>{const n=parse(e.start),end=parse(e.end);if(Number.isFinite(n))out.push({date:day(n),time:n,title:e.title,type:'exams',label:'Mulai ujian',detail:fmt(end)+' · batas akhir',id:e.id});});
    const meetings=[...new Map([...(academic?.meetings||[]),...(academic?.todayMeetings||[])].map(m=>[m.sessionId,m])).values()];
    meetings.filter(m=>(!filter.classId||m.classId===filter.classId)&&(pageName!=='schedule'||!filter.teacherId||m.teacherId===filter.teacherId)).forEach(m=>out.push({date:m.date,time:m.startMs,title:m.subject,type:'schedule',label:m.cancelled?'Dibatalkan':'Pelajaran',detail:cls(m.classId)+' · '+m.start+'–'+m.end+' · '+(m.room||'Ruang belum diisi'),meeting:m}));
    return out.sort((a,b)=>a.time-b.time);
  }
  function eventCards(list){return list.length?list.map(e=>`<article class="p-event ${e.meeting?.cancelled?'p-cancelled':''}"><span class="p-event-icon p-${e.type}">${icon(e.type==='exams'?'monitor':e.type)}</span><div><small>${esc(e.label)} · ${esc(e.date)}</small><strong>${esc(e.title)}</strong><p>${esc(e.detail)}</p>${e.meeting?.note?`<p>${esc(e.meeting.note)}</p>`:''}</div><button class="secondary smallbtn" data-open="${e.type==='exams'?'exams':e.type}">Buka</button></article>`).join(''):empty('Tidak ada kegiatan pada tanggal ini.');}
  function calendar(){
    const [y,m]=month.split('-').map(Number),n=new Date(Date.UTC(y,m,0)).getUTCDate(),offset=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7,all=events();
    return `<article class="p-card p-calendar"><div class="p-card-head"><div><span class="eyebrow">AGENDA BELAJAR · WITA</span><h3>${new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)))}</h3></div><div class="p-calendar-nav"><button class="secondary" id="pPrevMonth" aria-label="Bulan sebelumnya">‹</button><button class="secondary" id="pNextMonth" aria-label="Bulan berikutnya">›</button></div></div><div class="p-switch"><button id="pMonthMode" class="${calendarMode==='month'?'active':''}">Bulan</button><button id="pAgendaMode" class="${calendarMode==='agenda'?'active':''}">Agenda</button><button id="pToday">Hari ini</button></div>${calendarMode==='month'?`<div class="p-calendar-grid">${['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map(x=>`<small>${x}</small>`).join('')}${'<span></span>'.repeat(offset)}${Array.from({length:n},(_,i)=>{const d=month+'-'+String(i+1).padStart(2,'0'),ev=all.filter(e=>e.date===d);return `<button type="button" data-day="${d}" class="${d===selectedDay?'selected':''} ${d===day(Date.now())?'today':''}" aria-label="${d}, ${ev.length} kegiatan" aria-pressed="${d===selectedDay}">${i+1}<span>${[...new Set(ev.map(e=>e.type))].map(t=>`<i class="p-dot p-${t}"></i>`).join('')}</span></button>`;}).join('')}</div>`:''}<div class="p-calendar-events">${eventCards(all.filter(e=>calendarMode==='agenda'?e.date.startsWith(month):e.date===selectedDay))}</div><p class="p-caption">Ungu: tugas · Coral: ujian · Biru: pelajaran. Pengingat tampil di aplikasi.</p>${academicError?`<p class="lp-notice error">Jadwal belum dapat dimuat: ${esc(academicError)}</p>`:''}</article>`;
  }
  function bindCalendar(){
    const move=async(delta)=>{const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);selectedDay=month+'-01';await refresh(learning,role);};
    if(!$('pPrevMonth'))return;$('pPrevMonth').onclick=()=>move(-1);$('pNextMonth').onclick=()=>move(1);
    $('pMonthMode').onclick=()=>{calendarMode='month';renderCurrent();};$('pAgendaMode').onclick=()=>{calendarMode='agenda';renderCurrent();};
    $('pToday').onclick=()=>{month=day(Date.now()).slice(0,7);selectedDay=day(Date.now());refresh(learning,role);};
    host.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{selectedDay=b.dataset.day;renderCurrent();});
  }
  function bindOpen(root=host){root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{
    if(b.dataset.open==='exams'){if(role==='A')setAdminPage('monitor');else window.LearningUI.show('home');}
    else if(b.dataset.open==='classes')setAdminPage('classes');
    else window.LearningUI.show(b.dataset.open);
  });}
  function dashboard(){
    const s=scope(),today=events().filter(e=>e.date===day(Date.now())&&!e.meeting?.cancelled),todo=upcoming().slice(0,4),ungraded=s.submissions.filter(s=>s.score===null).length;
    host.innerHTML=`<div class="p-hero"><div><span class="eyebrow">SMKN 1 MANGGELEWA · RUANG ${role==='A'?'GURU':'SISWA'}</span><h2>Selamat datang, ${esc(learning.profile.name)}.</h2><p>${role==='A'?'Lihat perkembangan kelas dan tentukan langkah hari ini.':'Setiap langkah kecil membawa kemajuan. Ini perjalanan belajarmu.'}</p><button data-open="${role==='A'?'schedule':'tasks'}">${role==='A'?'Lihat jadwal mengajar':'Lanjutkan tugas'} ${icon('arrow')}</button><button class="secondary" id="pRefreshDashboard">Muat ulang ringkasan</button></div><div class="p-hero-date"><strong>${new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Makassar',day:'numeric'}).format(new Date())}</strong><span>${new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Makassar',month:'long',year:'numeric'}).format(new Date())}</span></div></div>${filters()}<div class="p-metrics">${metric(role==='A'?'Siswa aktif':'Ujian selesai',role==='A'?s.students.length:s.complete,role==='A'?'Dalam kelas terpilih':s.exams.length+' ujian tersedia / riwayat',role==='A'?'classes':'exams')}${metric('Kehadiran',s.percent===null?'—':s.percent+'%',s.recorded+' catatan final','attendance')}${metric(role==='A'?'Menunggu penilaian':'Tugas dikumpulkan',role==='A'?ungraded:s.submissions.length,role==='A'?'Versi terbaru pengumpulan':s.tasks.length+' tugas pada periode ini','tasks')}${metric('Agenda hari ini',today.length,'Kalender & pelajaran (WITA)','schedule')}</div><div class="p-dashboard-grid"><div class="p-main-grid">${attendanceChart(s)}${taskChart(s)}${examChart(s)}${weekChart(s)}<article class="p-card p-span"><h3>${role==='A'?'Perlu ditindaklanjuti':'Prioritas tugas'}</h3>${role==='A'?`<button class="p-alert" data-open="tasks">${ungraded} pengumpulan menunggu nilai ${icon('arrow')}</button><button class="p-alert" data-open="attendance">${s.counts.BELUM_DICATAT} kehadiran belum dicatat ${icon('arrow')}</button>`:''}${todo.length?todo.map(t=>`<button class="p-todo" data-open="tasks"><span><strong>${esc(t.title)}</strong><small>${esc(cls(t.classId))} · ${fmt(t.due)}</small></span><b class="${t.due<Date.now()?'overdue':''}">${t.due<Date.now()?'Lewat tenggat':day(t.due)===day(Date.now())?'Hari ini':'Mendatang'}</b></button>`).join(''):empty('Tidak ada tugas yang perlu ditampilkan.')}</article><article class="p-card p-span"><div class="p-card-head"><h3>Aktivitas terbaru</h3><span class="p-pill">${filter.period==='all'?'Semua periode':filter.period+' hari'}</span></div>${activity(s)}</article></div>${calendar()}</div>`;
    bindFilters();bindCalendar();bindOpen();$('pRefreshDashboard').onclick=e=>action(e.currentTarget,async()=>{if(role==='A')renderAdmin(await call('getAdminDashboard',S.token));else renderStudent(await call('getDashboard',S.token));});
  }
  function activity(s){
    const items=[...s.submissions.map(x=>({time:x.submittedMs,title:(role==='A'?x.name+' · ':'')+(learning.tasks.find(t=>t.id===x.taskId)?.title||'Tugas'),text:x.score===null?'Tugas dikumpulkan · belum dinilai':'Nilai '+x.score+' / 100',type:'tasks'})),...s.att.filter(a=>a.status!=='BELUM_DICATAT').map(a=>({time:a.updatedMs||a.dateMs,title:(role==='A'?a.name+' · ':'')+a.title,text:labels[a.status],type:'attendance'}))].sort((a,b)=>b.time-a.time).slice(0,6);
    return items.length?items.map(x=>`<button class="p-activity" data-open="${x.type}">${icon(x.type)}<span><strong>${esc(x.title)}</strong><small>${esc(x.text)}</small></span><time>${fmt(x.time)}</time></button>`).join(''):empty('Aktivitas akan muncul setelah ada pencatatan.');
  }
  function schedules(){
    host.innerHTML=`<p class="p-caption">Jadwal berulang mengikuti tanggal berlaku. Pembatalan pertemuan tidak membuat siswa alpa.</p>${filters()}${academicError?`<p class="lp-notice error">${esc(academicError)}</p>`:''}${!academic?empty('Memuat jadwal…'):!academic.ready?'<p class="lp-notice">Jadwal belum diaktifkan. Jalankan setup-sheet.mjs pada database yang digunakan.</p>':''}${role==='A'?`<div class="p-toolbar"><button id="pNewSchedule" ${!academic?.ready?'disabled':''}>＋ Tambah jadwal</button><label>Guru<select id="pTeacherFilter">${choice([['','Semua guru'],...(academic?.teachers||[]).map(t=>[t.id,t.name])],filter.teacherId)}</select></label></div>`:''}<div id="pScheduleEditor"></div><div class="p-schedule-layout">${calendar()}<article class="p-card"><h3>${role==='A'?'Daftar jadwal mengajar':'Jadwal kelasku'}</h3>${(academic?.schedules||[]).filter(s=>(role==='A'||s.status==='TERBIT')&&(!filter.classId||s.classId===filter.classId)&&(!filter.teacherId||s.teacherId===filter.teacherId)).map(s=>`<div class="p-schedule-item"><span class="p-pill">${esc(s.status)}</span><h4>${esc(s.subject)}</h4><p>${esc(cls(s.classId))} · ${esc(teacher(s.teacherId))}</p><strong>${['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][s.weekday]} · ${esc(s.start)}–${esc(s.end)}</strong><p>${esc(s.room||'Ruang belum diisi')} · ${esc(s.from)} sampai ${esc(s.until)}</p>${role==='A'&&(s.status!=='TERBIT'||s.from>day(Date.now()))?`<button class="secondary" data-edit-schedule="${esc(s.id)}">Edit jadwal</button>`:''}${role==='A'&&s.status==='TERBIT'&&s.until>day(Date.now())?`<button class="secondary" data-end-schedule="${esc(s.id)}">Akhiri masa berlaku</button>`:''}</div>`).join('')||empty('Belum ada jadwal dalam pilihan ini.')}<h3>Pertemuan bulan ini</h3>${(academic?.meetings||[]).filter(m=>m.date.startsWith(month)&&(!filter.classId||m.classId===filter.classId)&&(!filter.teacherId||m.teacherId===filter.teacherId)).map((m)=>`<div class="p-schedule-item ${m.cancelled?'p-cancelled':''}"><strong>${esc(m.subject)} · ${esc(m.date)}</strong><p>${esc(cls(m.classId))} · ${m.start}–${m.end}</p>${m.cancelled?`<p>Dibatalkan: ${esc(m.note)}</p>`:role==='A'?`<div class="p-toolbar">${m.date===day(Date.now())?`<button data-open-meeting="${esc(m.id)}" data-date="${m.date}">Buka absensi</button>`:''}${m.date>=day(Date.now())?`<button class="secondary" data-cancel-meeting="${esc(m.id)}" data-date="${m.date}">Batalkan pertemuan</button>`:''}</div>`:''}</div>`).join('')||empty('Tidak ada pertemuan.')}</article></div>`;
    bindFilters();bindCalendar();bindOpen();
    if($('pNewSchedule'))$('pNewSchedule').onclick=()=>editSchedule();
    if($('pTeacherFilter'))$('pTeacherFilter').onchange=e=>{filter.teacherId=e.target.value;remember();renderCurrent();};
    host.querySelectorAll('[data-edit-schedule]').forEach(b=>b.onclick=()=>editSchedule(academic.schedules.find(s=>s.id===b.dataset.editSchedule)));
    host.querySelectorAll('[data-end-schedule]').forEach(b=>b.onclick=()=>{const until=prompt('Tanggal terakhir jadwal tetap berlaku (YYYY-MM-DD). Buat jadwal pengganti mulai hari setelahnya:',day(Date.now()));if(until)action(b,()=>api('endSchedule',{id:b.dataset.endSchedule,until}));});
    host.querySelectorAll('[data-cancel-meeting]').forEach(b=>b.onclick=()=>{const note=prompt('Alasan pembatalan (siswa akan melihat catatan ini):');if(note)action(b,()=>api('cancelMeeting',{id:b.dataset.cancelMeeting,date:b.dataset.date,note}));});
    host.querySelectorAll('[data-open-meeting]').forEach(b=>b.onclick=()=>action(b,async()=>{const result=await api('openMeeting',{id:b.dataset.openMeeting,date:b.dataset.date});S.adminAttendanceSessionId=result.sessionId;renderAdmin(await call('getAdminDashboard',S.token));setAdminPage('attendance');if(result.closed)feedback('Pertemuan ini sudah memiliki sesi yang ditutup.');}));
  }
  function editSchedule(s={}){
    const field=(name,title,type='text',value=s[name]||'')=>`<label>${title}<input name="${name}" type="${type}" value="${esc(value)}" ${name==='room'?'':'required'}></label>`;
    $('pScheduleEditor').innerHTML=`<form class="lp-form" id="pScheduleForm"><h3>${s.id?'Edit':'Tambah'} jadwal</h3><div class="lp-form-grid"><label>Kelas<select name="classId" required>${choice(learning.classes.map(c=>[c.id,c.name]),s.classId||filter.classId)}</select></label><label>Guru<select name="teacherId">${choice(academic.teachers.map(t=>[t.id,t.name]),s.teacherId||learning.profile.id)}</select></label>${field('subject','Mata pelajaran')}${field('room','Ruang (opsional)')}<label>Hari<select name="weekday">${choice(['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'].map((d,i)=>[String(i),d]),String(s.weekday??1))}</select></label><label>Status<select name="status">${choice(['DRAF','TERBIT','ARSIP'].map(s=>[s,s]),s.status||'DRAF')}</select></label>${field('start','Jam mulai (WITA)','time')}${field('end','Jam selesai (WITA)','time')}${field('from','Berlaku dari','date',s.from||day(Date.now()))}${field('until','Berlaku sampai','date')}</div><p class="p-caption">Jadwal yang sudah berlaku dikunci untuk menjaga riwayat. Untuk pergantian rutin, akhiri masa berlaku lalu buat jadwal baru mulai hari setelahnya. Pembatalan hanya untuk satu tanggal.</p><div class="p-toolbar"><button type="submit">Simpan jadwal</button><button type="button" class="secondary" id="pCancelScheduleEdit">Batal</button></div></form>`;
    $('pCancelScheduleEdit').onclick=()=>$('pScheduleEditor').replaceChildren();
    $('pScheduleForm').onsubmit=e=>{e.preventDefault();action(e.target.querySelector('[type=submit]'),()=>api('saveSchedule',{...Object.fromEntries(new FormData(e.target)),id:s.id}));};
    $('pScheduleEditor').scrollIntoView({block:'start'});
  }
  function profile(root,d,r){
    learning=d;role=r;const s=scope(),p=d.profile,form=root.querySelector('#lpProfileForm');
    root.querySelector('.lp-profile-head')?.remove();
    root.insertAdjacentHTML('afterbegin',`<div class="p-profile-layout"><aside class="p-card p-identity"><span class="eyebrow">PROFIL ${r==='A'?'GURU':'SISWA'}</span><div class="p-photo">${d.photo?`<img src="${esc(d.photo)}" alt="Foto profil ${esc(p.name)}">`:`<span>${esc(p.name.slice(0,2).toUpperCase())}</span>`}</div><h2>${esc(p.name)}</h2><span class="p-pill">${r==='A'?'Guru / Admin':esc(p.className)}</span><p>${esc(p.id)}${r==='S'?' · Kelompok '+esc(p.group):''}</p><p class="lp-pre">${esc(p.bio||'Lengkapi profil agar ruang belajarmu terasa lebih personal.')}</p><button id="pEditProfile" class="secondary">Edit informasi</button><label class="p-photo-input">Ganti foto<input id="pPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" ${!d.photoEnabled?'disabled':''}></label><small>Foto diperkecil menjadi thumbnail privat.</small><dl class="p-contact"><dt>Email</dt><dd>${esc(p.email||'Belum diisi')}</dd><dt>Kontak</dt><dd>${esc(p.phone||'Belum diisi')}</dd>${r==='A'?`<dt>Mata pelajaran</dt><dd>${esc(p.subject||'Belum diisi')}</dd>`:''}</dl></aside><div class="p-profile-content"><div class="p-profile-banner"><span class="eyebrow">${r==='A'?'RUANG MENGAJAR':'PERJALANAN BELAJAR'}</span><h2>${r==='A'?'Kelas yang tumbuh bersamamu.':'Lihat hasil setiap usahamu.'}</h2><p>${r==='A'?'Ringkasan kelas pada periode terpilih.':'Kehadiran, tugas, dan ujian ditampilkan terpisah agar mudah dipahami.'}</p><div class="p-profile-stats"><div><strong>${s.percent===null?'—':s.percent+'%'}</strong><span>Kehadiran${r==='A'?' kelas':''}</span></div><div><strong>${s.submissions.length}</strong><span>Pengumpulan tugas</span></div><div><strong>${s.complete}</strong><span>Ujian selesai</span></div></div></div><div class="p-main-grid">${attendanceChart(s)}${taskChart(s)}</div><article class="p-card"><h3>Aktivitas terakhir</h3>${activity(s)}</article><div id="pProfileEdit"></div></div></div>`);
    form.classList.add('hidden');$('pProfileEdit').append(form);$('pEditProfile').onclick=()=>{form.classList.toggle('hidden');if(!form.classList.contains('hidden'))form.scrollIntoView({block:'center'});};
    $('pPhotoInput').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      if(file.size>8*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){feedback('Pilih JPG, PNG, atau WEBP maksimal 8 MB.',true);return;}
      const url=URL.createObjectURL(file);e.target.disabled=true;
      try{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=c.height=160;const ctx=c.getContext('2d'),side=Math.min(img.width,img.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,160,160);ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,160,160);const photo=c.toDataURL('image/jpeg',.65);await api('savePhoto',{photo});await window.LearningUI.reload();feedback('Foto profil disimpan.');}catch(err){feedback(err.message,true);}finally{URL.revokeObjectURL(url);if(e.target.isConnected)e.target.disabled=false;}
    };bindOpen(root);
  }
  function classTabs(){
    const page=$('adminClassPage');if(!page||$('pClassTabs'))return;
    const card=page.querySelector('.table-card'),placement=page.querySelector('.student-placement'),history=page.querySelector('.class-history'),manager=$('studentManager');
    const catalog=document.createElement('section');catalog.id='pClassCatalog';
    [...card.children].filter(n=>![placement,history,manager].includes(n)).forEach(n=>catalog.append(n));
    card.append(catalog);catalog.append(manager);
    const nav=document.createElement('div');nav.id='pClassTabs';nav.className='p-switch';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','Bagian kelas');
    for(const [key,title] of [['catalog','Daftar kelas'],['placement','Penempatan siswa'],['history','Riwayat perpindahan']]){const b=document.createElement('button');b.type='button';b.textContent=title;b.dataset.classTab=key;b.setAttribute('role','tab');b.onclick=()=>select(key);nav.append(b);}
    card.before(nav);const select=key=>{classTab=key;catalog.classList.toggle('hidden',key!=='catalog');placement.classList.toggle('hidden',key!=='placement');history.classList.toggle('hidden',key!=='history');nav.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.classTab===key);b.setAttribute('aria-selected',String(b.dataset.classTab===key));});};select(classTab);
  }
  function rosterEditor(exam,core){
    $('pRosterPanel')?.remove();
    const panel=document.createElement('details');panel.id='pRosterPanel';panel.className='p-roster';const roster=core.examRosters?.[exam.id],locked=core.attempts.some(a=>a.examId===exam.id);
    panel.innerHTML=`<summary>${roster?'Peserta: '+roster.studentIds.length+' siswa':'Cakupan peserta belum ditetapkan'}</summary><p>${locked?'Daftar peserta dikunci karena sudah ada percobaan. Riwayat dan akses ujian lama dipertahankan.':'Pilih kelas, periksa siswa, lalu simpan. Hanya siswa yang dipilih dapat memulai ujian ini.'}</p>${locked?'':`<form id="pRosterForm"><div class="p-roster-classes">${core.classes.filter(c=>c.source!=='legacy'&&c.active!==false).map(c=>`<label><input type="checkbox" name="classIds" value="${esc(c.id)}" ${roster?.classIds.includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')}</div><div id="pRosterStudents"></div><p id="pRosterCount"></p><button type="submit">Simpan peserta ujian</button></form>`}`;
    $('adminSummary').after(panel);
    if(locked)return;
    const draw=()=>{const classes=[...panel.querySelectorAll('[name=classIds]:checked')].map(n=>n.value);$('pRosterStudents').innerHTML=core.students.filter(s=>s.active&&classes.includes(s.classId)).map(s=>`<label><input type="checkbox" name="studentIds" value="${esc(s.id)}" checked>${esc(s.name)} <small>${esc(s.id)}</small></label>`).join('')||empty('Pilih kelas untuk menampilkan siswa.');count();};
    const count=()=>{$('pRosterCount').textContent=panel.querySelectorAll('[name=studentIds]:checked').length+' siswa dipilih';};
    panel.querySelectorAll('[name=classIds]').forEach(n=>n.onchange=draw);draw();
    if(roster){panel.querySelectorAll('[name=studentIds]').forEach(n=>n.checked=roster.studentIds.includes(n.value));count();}
    $('pRosterStudents').onchange=count;
    $('pRosterForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);action(e.target.querySelector('button'),async()=>{await api('saveRoster',{examId:exam.id,classIds:f.getAll('classIds'),studentIds:f.getAll('studentIds')});renderAdmin(await call('getAdminDashboard',S.token));feedback('Peserta ujian disimpan.');});};
  }
  function decorate(){
    document.querySelectorAll('[data-lp-page],#adminMonitorNav,#adminBankNav,#adminClassesNav,#adminAttendanceNav').forEach(b=>{if(b.querySelector('svg'))return;const key=b.dataset.lpPage||({adminMonitorNav:'monitor',adminBankNav:'materials',adminClassesNav:'classes',adminAttendanceNav:'attendance'})[b.id];b.insertAdjacentHTML('afterbegin',icon(key));});
  }
  function renderCurrent(){if(host?.isConnected&&pageName==='dashboard')dashboard();else if(host?.isConnected&&pageName==='schedule')schedules();}
  async function refresh(data,r){
    learning=data;role=r;const n=++request,currentToken=S.token;
    if(token!==currentToken){token=currentToken;academic=null;academicError='';filter={classId:'',period:'30',teacherId:''};try{const f=JSON.parse(sessionStorage.getItem('PORTAL_FILTERS')||'{}');if(['7','30','90','all'].includes(f.period))filter.period=f.period;if(r==='A'){filter.classId=f.classId||'';filter.teacherId=f.teacherId||'';}}catch{}}
    const [y,m]=month.split('-').map(Number),from=month+'-01',until=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
    try{const result=await api('academic',{from,until});if(n!==request||S.token!==currentToken)return;academic=result;academicError='';}
    catch(e){if(n!==request||S.token!==currentToken)return;academic=null;academicError=e.message;}
    renderCurrent();
  }
  window.PortalUI={
    core(r,data){coreData[r]=data;},refresh,decorate,classTabs,rosterEditor,profile,clearRoster(){ $('pRosterPanel')?.remove(); },
    page(p){pageName=p;},adminPage(p){if(p!=='learning')pageName='';},
    render(root,page,data,r){host=root;pageName=page;learning=data;role=r;renderCurrent();},
    reset(){clearTimeout(toastTimer);$('pToast')?.remove();request++;coreData={};learning=null;academic=null;academicError='';host=null;pageName='';token='';month=day(Date.now()).slice(0,7);selectedDay=day(Date.now());filter={classId:'',period:'30',teacherId:''};}
  };
})();
