/* Learning portal: isolated from the exam runner; all writes go through authenticated APIs. */
(() => {
  const $ = id => document.getElementById(id);
  const labels = {HADIR:'Hadir',TERLAMBAT:'Terlambat',IZIN:'Izin',SAKIT:'Sakit',ALPA:'Alpa',BELUM_DICATAT:'Belum dicatat'};
  const pages = {attendance:'Kehadiran',materials:'Materi',tasks:'Tugas',profile:'Profil saya'};
  let data=null,role='',current={S:'home',A:'home'},generation=0,loading=false,submitKey='',queuedRefresh=false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = ms => Number(ms)?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Makassar',dateStyle:'medium',timeStyle:'short'}).format(new Date(Number(ms))):'—';
  const day = ms => Number(ms)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Number(ms))):'';
  const badge = s => `<span class="lp-badge lp-${esc(s)}">${esc(labels[s]||s)}</span>`;
  const cls = id => data?.classes.find(c=>c.id===id)?.name || id;
  const options = (arr,value) => arr.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('');
  const statusOptions = v => options(Object.entries(labels).filter(([s])=>s!=='BELUM_DICATAT'),v);
  const empty = text => `<div class="lp-empty">${esc(text)}</div>`;
  function notice(message,bad=false) { const out=$('lpNotice'+role);if(out){out.textContent=message;out.className='lp-notice'+(bad?' error':'');out.hidden=!message;} }
  async function api(action,input={}) {
    const token=S.token;
    const res=await fetch('/api/learning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,action,token})});
    let result;try{result=await res.json();}catch{throw new Error('Respons server tidak terbaca. Coba ulang, atau perkecil ukuran berkas.');}
    if(!res.ok)throw new Error(result.error||'Permintaan gagal.');
    return result;
  }
  function panel() { return $('lpPanel'+role); }
  function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }
  async function run(button,action,success='Tersimpan.') {
    button.disabled=true;notice('Menyimpan…');
    try { await action();await load();notice(success); } catch(e){notice(e.message,true);} finally{button.disabled=false;}
  }
  function summary() {
    if(!data)return '';
    const counts=Object.fromEntries(Object.keys(labels).map(s=>[s,0]));data.attendance.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
    const total=data.attendance.filter(r=>r.status!=='BELUM_DICATAT').length;
    const present=counts.HADIR+counts.TERLAMBAT;
    return `<div class="lp-stats">${Object.entries(labels).map(([s,l])=>`<div><small>${l}</small><strong>${counts[s]}</strong></div>`).join('')}</div><p class="muted">Kehadiran ${total?Math.round(present/total*100)+'%':'belum tersedia'} · ${present} hadir/terlambat dari ${total} catatan final. Belum dicatat tidak dihitung sebagai ketidakhadiran.</p>`;
  }
  function homeSummary() {
    if(!data)return;
    if(role==='S') {
      const box=$('lpHomeSummary');box.hidden=false;
      const latest=new Map();data.submissions.forEach(s=>latest.set(s.taskId,s));
      box.innerHTML=`<div class="flex between"><h2>Kehadiran & tugas</h2><button type="button" data-open="attendance" class="secondary">Lihat kehadiran</button></div>${summary()}<p><strong>${data.materials.length}</strong> materi tersedia · <strong>${data.tasks.filter(t=>!latest.has(t.id)).length}</strong> tugas belum dikumpulkan</p><div class="flex"><button type="button" data-open="materials" class="secondary">Buka materi</button><button type="button" data-open="tasks">Buka tugas</button></div>`;
      box.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>show(b.dataset.open));
      const name=data.profile.name;if(name)$('hello').textContent='Halo, '+name;
    }
  }
  async function load() {
    if(loading){queuedRefresh=true;return;}loading=true;
    const token=S.token,requestRole=role,id=++generation;
    try {
      const result=await api('dashboard');
      if(id!==generation||S.token!==token||role!==requestRole)return;
      data=result;homeSummary();if(current[role]!=='home')render();
    } catch(e) {
      if(S.token!==token||role!==requestRole)return;
      if(current[role]!=='home'){panel().replaceChildren();notice(e.message,true);}
      else if(role==='S'){$('lpHomeSummary').hidden=false;$('lpHomeSummary').textContent=e.message;}
    } finally {loading=false;if(queuedRefresh){queuedRefresh=false;load();}}
  }
  function show(page) {
    current[role]=page;notice('');
    if(role==='A')setAdminPage('learning');
    else {
      const host=$('studentView');host.classList.toggle('lp-student-page',page!=='home');
      host.querySelectorAll(':scope > .welcome,:scope > .student-summary,:scope > .section-heading,:scope > #examList,:scope > .student-guide,:scope > #lpHomeSummary').forEach(n=>n.classList.toggle('hidden',page!=='home'));
    }
    $('lpShell'+role).classList.toggle('hidden',page==='home');
    document.querySelectorAll('[data-lp-role="'+role+'"]').forEach(b=>{const active=b.dataset.lpPage===page;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
    if(role==='S')document.querySelector('.student-rail a.active')?.classList.remove('active');
    $('lpTitle'+role).textContent=pages[page]||'Pembelajaran';
    if(data)render();else {panel().textContent='Memuat data pembelajaran…';load();}
    window.scrollTo({top:0,behavior:'auto'});
  }
  function mount(nextRole) {
    const changed=role!==nextRole || mount.token!==S.token;
    if(changed){role=nextRole;mount.token=S.token;data=null;current={S:'home',A:'home'};generation++;if(role==='S'){const host=$('studentView');host.classList.remove('lp-student-page');host.querySelectorAll(':scope > .welcome,:scope > .student-summary,:scope > .section-heading,:scope > #examList,:scope > .student-guide,:scope > #lpHomeSummary').forEach(n=>n.classList.remove('hidden'));}}
    if(!$('lpShell'+role)) {
      const shell=document.createElement('section');shell.id='lpShell'+role;shell.className='lp-shell hidden';
      shell.innerHTML=`<div class="flex between"><div><span class="eyebrow">Ruang pembelajaran</span><h2 id="lpTitle${role}">Pembelajaran</h2></div><button id="lpReload${role}" type="button" class="secondary">Muat ulang</button></div><div id="lpNotice${role}" class="lp-notice" role="status" aria-live="polite" hidden></div><div id="lpPanel${role}"></div>`;
      $(role==='S'?'studentView':'adminView').append(shell);$('lpReload'+role).onclick=()=>{notice('');load();};
      const nav=role==='S'?document.querySelector('.student-rail nav'):$('adminNav');
      for(const [key,label] of Object.entries(pages)) {const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.lpPage=key;b.dataset.lpRole=role;b.onclick=()=>show(key);nav.append(b);}
      if(role==='S') {
        const box=document.createElement('section');box.id='lpHomeSummary';box.className='card lp-home-summary';box.hidden=true;document.querySelector('#studentView .student-summary').after(box);
        document.querySelectorAll('.student-rail a').forEach(a=>a.addEventListener('click',()=>show('home')));
      }
    }
    if(role==='A'&&S.adminPage==='learning')show(current.A==='home'?'attendance':current.A);
    load();
  }
  function render() { if(!data)return;const p=current[role];if(p==='attendance')renderAttendance();if(p==='materials')renderMaterials();if(p==='tasks')renderTasks();if(p==='profile')renderProfile(); }
  function renderAttendance() {
    const admin=role==='A';
    panel().innerHTML=`<p class="muted">${admin?'Koreksi status dan tulis alasan untuk setiap siswa. Sesi baru menyimpan daftar peserta saat dibuka.':'Riwayat kehadiranmu per pertemuan, termasuk catatan dari guru.'}</p><div class="lp-filters">${admin?`<label>Kelas<select id="lpAttClass"><option value="">Semua kelas</option>${options(data.classes.map(c=>[c.id,c.name]))}</select></label><label>Sesi<select id="lpAttSession"><option value="">Semua sesi</option>${options(data.sessions.map(s=>[s.id,s.title+' · '+date(s.dateMs)]))}</select></label>`:''}<label>Dari tanggal (WITA)<input type="date" id="lpAttFrom"></label><label>Sampai tanggal<input type="date" id="lpAttTo"></label><label>Status<select id="lpAttStatus"><option value="">Semua status</option>${options(Object.entries(labels))}</select></label>${admin?'<label>Cari nama / ID<input id="lpAttSearch" type="search"></label>':''}</div><div id="lpAttTotals"></div><div id="lpAttList" class="lp-list"></div>`;
    const draw=()=>{
      const from=$('lpAttFrom').value,to=$('lpAttTo').value,status=$('lpAttStatus').value,q=($('lpAttSearch')?.value||'').toLowerCase();
      const found=data.attendance.filter(r=>(!from||day(r.dateMs)>=from)&&(!to||day(r.dateMs)<=to)&&(!status||r.status===status)&&(!$('lpAttClass')?.value||r.classId===$('lpAttClass').value)&&(!$('lpAttSession')?.value||r.sessionId===$('lpAttSession').value)&&(!q||(r.name+' '+r.studentId).toLowerCase().includes(q)));
      const original=data.attendance;data.attendance=found;$('lpAttTotals').innerHTML=summary();data.attendance=original;
      $('lpAttList').innerHTML=found.length?found.map((r,i)=>`<article class="lp-item"><div class="flex between"><div><h3>${esc(admin?r.name:r.title)}</h3><p>${esc(admin?r.studentId+' · '+r.title:cls(r.classId))} · ${date(r.dateMs)}</p></div>${badge(r.status)}</div>${admin?`<form data-att="${i}" class="lp-att-form"><label>Status<select name="status">${r.status==='BELUM_DICATAT'?'<option value="">Pilih status</option>':''}${statusOptions(r.status)}</select></label><label>Catatan<input name="note" maxlength="500" value="${esc(r.note)}" placeholder="Contoh: izin kegiatan sekolah"></label><button type="submit">Simpan</button></form>`:`<p>${esc(r.note||'Tidak ada catatan tambahan.')}</p>`}<small>${r.updatedMs?'Diperbarui '+date(r.updatedMs):r.status==='ALPA'?'Belum hadir saat sesi ditutup. Hubungi guru jika perlu koreksi.':'Belum ada pencatatan guru.'}</small></article>`).join(''):empty('Tidak ada catatan sesuai filter.');
      $('lpAttList').querySelectorAll('form').forEach(f=>f.onsubmit=ev=>{ev.preventDefault();const r=found[Number(f.dataset.att)],v=formValues(f);run(f.querySelector('button'),()=>api('markAttendance',{sessionId:r.sessionId,studentId:r.studentId,...v}),'Kehadiran diperbarui.');});
    };
    panel().querySelectorAll('.lp-filters input,.lp-filters select').forEach(n=>n.oninput=draw);draw();
  }
  function contentForm(kind,item={}) {
    const material=kind==='material';
    const dateValue=item.due?new Date(item.due+8*3600000).toISOString().slice(0,16):'';
    return `<form id="lpContentForm" class="lp-form"><h3>${item.id?'Edit':'Tambah'} ${material?'materi':'tugas'}</h3><div class="lp-form-grid"><label>Kelas tujuan<select name="classId" required ${item.id?'disabled':''}>${options(data.classes.map(c=>[c.id,c.name]),item.classId)}</select></label><label>Status<select name="status">${options(['DRAF','TERBIT','ARSIP'].map(s=>[s,s]),item.status||'DRAF')}</select></label><label class="lp-wide">Judul<input name="title" required maxlength="160" value="${esc(item.title)}"></label>${material?`<label class="lp-wide">Topik / bab<input name="topic" maxlength="120" value="${esc(item.topic)}"></label><label class="lp-wide">Isi materi<textarea name="content" required maxlength="15000">${esc(item.content)}</textarea></label><label class="lp-wide">Tautan bacaan, video, atau dokumen (HTTPS)<input name="link" type="url" value="${esc(item.link)}" placeholder="https://..."></label>`:`<label class="lp-wide">Instruksi tugas<textarea name="instructions" required maxlength="15000">${esc(item.instructions)}</textarea></label><label>Batas pengumpulan (WITA)<input name="due" type="datetime-local" required value="${dateValue}"></label><label class="lp-checkbox"><input name="allowLate" type="checkbox" ${item.allowLate?'checked':''}>Terima pengumpulan terlambat</label>`}</div><p class="muted">Draf hanya terlihat oleh guru. Terbit menampilkan konten di kelas tujuan. Arsip menyembunyikannya dari daftar siswa.</p><div class="flex"><button type="submit">Simpan ${material?'materi':'tugas'}</button><button type="button" id="lpCancelContent" class="secondary">Batal</button></div></form>`;
  }
  function editContent(kind,item={}) {
    $('lpEditor').innerHTML=contentForm(kind,item);$('lpEditor').scrollIntoView({block:'start'});
    $('lpCancelContent').onclick=()=>$('lpEditor').replaceChildren();
    $('lpContentForm').onsubmit=ev=>{ev.preventDefault();const f=ev.currentTarget,v=formValues(f);if(item.id){v.id=item.id;v.classId=item.classId;}
      if(kind==='task'){v.due=new Date(v.due+':00+08:00').getTime();v.allowLate=f.elements.allowLate.checked;}
      run(f.querySelector('button[type=submit]'),()=>api(kind==='material'?'saveMaterial':'saveTask',v));
    };
  }
  function renderMaterials() {
    panel().innerHTML=`<p class="muted">${role==='A'?'Susun bacaan dan tautan belajar untuk kelas tujuan.':'Bacaan dan sumber belajar yang dibagikan guru untuk kelasmu.'}</p>${role==='A'?'<button id="lpAddMaterial" type="button">＋ Tambah materi</button>':''}<div id="lpEditor"></div><div class="lp-list">${data.materials.length?data.materials.map((m,i)=>`<article class="lp-item"><div class="flex between"><span class="eyebrow">${esc(cls(m.classId))} · ${esc(m.topic||'Materi pembelajaran')}</span>${role==='A'?badge(m.status):''}</div><h3>${esc(m.title)}</h3><details><summary>Baca materi</summary><p class="lp-pre">${esc(m.content)}</p>${/^https:\/\//.test(m.link)?`<a class="lp-link" href="${esc(m.link)}" target="_blank" rel="noopener noreferrer">Buka sumber belajar ↗</a>`:''}</details>${role==='A'?`<button type="button" data-edit-material="${i}" class="secondary">Edit materi</button>`:''}</article>`).join(''):empty('Belum ada materi yang diterbitkan.')}</div>`;
    if($('lpAddMaterial'))$('lpAddMaterial').onclick=()=>editContent('material');
    panel().querySelectorAll('[data-edit-material]').forEach(b=>b.onclick=()=>editContent('material',data.materials[Number(b.dataset.editMaterial)]));
  }
  function fileLinks(sub) {return sub.files.map(f=>`<button type="button" class="secondary lp-file" data-sub="${esc(sub.id)}" data-file="${esc(f.id)}">Unduh ${esc(f.name)} (${Math.ceil(f.size/1024)} KB)</button>`).join('');}
  function bindDownloads() {panel().querySelectorAll('[data-file]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const f=await api('download',{submissionId:b.dataset.sub,fileId:b.dataset.file});const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:f.mime})),a=document.createElement('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){notice(e.message,true);}finally{b.disabled=false;}});}
  function renderTasks() {
    panel().innerHTML=`<p class="muted">${role==='A'?'Terbitkan tugas, periksa foto/berkas jawaban, lalu berikan nilai dan umpan balik.':'Foto hasil pekerjaanmu dengan jelas, lalu unggah pada tugas yang sesuai.'}</p>${role==='A'?'<div class="flex"><button id="lpAddTask" type="button">＋ Tambah tugas</button><button id="lpCheckStorage" type="button" class="secondary">Periksa penyimpanan</button></div>':''}${!data.uploadConfigured?'<div class="lp-notice error">Unggahan belum tersedia. Admin perlu menyiapkan folder penyimpanan tugas.</div>':''}<div id="lpEditor"></div><div class="lp-list">${data.tasks.length?data.tasks.map((t,i)=>{
      const subs=data.submissions.filter(s=>s.taskId===t.id),latest=subs.at(-1),expired=Date.now()>t.due;
      return `<article class="lp-item"><div class="flex between"><span class="eyebrow">${esc(cls(t.classId))}</span>${badge(role==='A'?t.status:latest?(latest.score!==null?'DINILAI':latest.late?'TERLAMBAT':'DIKUMPULKAN'):'BELUM DIKUMPULKAN')}</div><h3>${esc(t.title)}</h3><p class="lp-pre">${esc(t.instructions)}</p><p><strong>Batas:</strong> ${date(t.due)} WITA · ${t.allowLate?'Terlambat tetap diterima':'Pengumpulan ditutup setelah batas waktu'}</p>${role==='A'?`<div class="flex"><button class="secondary" data-edit-task="${i}" type="button">Edit tugas</button><button data-review-task="${i}" type="button">Periksa pengumpulan (${new Set(subs.map(s=>s.studentId)).size} siswa)</button></div>`:`${latest?`<div class="lp-result"><strong>Terakhir dikirim: ${date(latest.submittedMs)}</strong><p>Nilai: ${latest.score!==null?latest.score+' / 100':'Belum dinilai'}</p><p>${esc(latest.feedback||'Belum ada umpan balik.')}</p>${fileLinks(latest)}<details><summary>Riwayat pengumpulan (${subs.length})</summary>${subs.slice().reverse().map(s=>`<p>${date(s.submittedMs)} · ${s.late?'Terlambat':'Tepat waktu'} · Nilai ${s.score??'belum dinilai'}</p>`).join('')}</details></div>`:''}${expired&&!t.allowLate?'<p class="lp-closed">Batas pengumpulan sudah lewat.</p>':`<button data-submit-task="${i}" type="button" ${!data.uploadConfigured?'disabled':''}>${latest?'Kirim perbaikan':'Kumpulkan tugas'}</button>`}`}</article>`;
    }).join(''):empty('Belum ada tugas yang diterbitkan.')}</div><div id="lpTaskDetail"></div>`;
    if($('lpAddTask'))$('lpAddTask').onclick=()=>editContent('task');
    if($('lpCheckStorage'))$('lpCheckStorage').onclick=ev=>run(ev.target,()=>api('checkStorage'),'Folder penyimpanan siap digunakan.');
    panel().querySelectorAll('[data-edit-task]').forEach(b=>b.onclick=()=>editContent('task',data.tasks[Number(b.dataset.editTask)]));
    panel().querySelectorAll('[data-submit-task]').forEach(b=>b.onclick=()=>submissionForm(data.tasks[Number(b.dataset.submitTask)]));
    panel().querySelectorAll('[data-review-task]').forEach(b=>b.onclick=()=>reviewTask(data.tasks[Number(b.dataset.reviewTask)]));bindDownloads();
  }
  function reviewTask(task) {
    const found=data.submissions.filter(s=>s.taskId===task.id).slice().reverse();
    const submitted=new Set(found.map(s=>s.studentId)),pending=(data.students||[]).filter(s=>s.classId===task.classId&&!submitted.has(s.id));
    $('lpTaskDetail').innerHTML=`<h3>Pengumpulan · ${esc(task.title)}</h3><div class="lp-notice"><strong>${submitted.size} siswa mengumpulkan · ${pending.length} belum mengumpulkan</strong>${pending.length?'<p>'+pending.map(s=>esc(s.name)+' ('+esc(s.id)+')').join(', ')+'</p>':''}</div>${found.length?found.map((s,i)=>`<article class="lp-item"><div class="flex between"><h3>${esc(s.name)} · ${esc(s.studentId)}</h3>${badge(s.late?'TERLAMBAT':'DIKUMPULKAN')}</div><p>${date(s.submittedMs)} · ${esc(s.note)}</p><div class="flex">${fileLinks(s)}</div><form data-grade="${i}" class="lp-form"><label>Nilai (0–100)<input name="score" type="number" min="0" max="100" step="0.01" required value="${s.score??''}"></label><label>Umpan balik<textarea name="feedback" maxlength="2000">${esc(s.feedback)}</textarea></label><button type="submit">Simpan penilaian</button></form></article>`).join(''):empty('Belum ada pengumpulan untuk tugas ini.')}`;
    $('lpTaskDetail').scrollIntoView({block:'start'});bindDownloads();
    panel().querySelectorAll('[data-grade]').forEach(f=>f.onsubmit=ev=>{ev.preventDefault();const s=found[Number(f.dataset.grade)];run(f.querySelector('button'),()=>api('grade',{submissionId:s.id,...formValues(f)}),'Nilai dan umpan balik tersimpan.');});
  }
  const readBase64 = file => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Berkas tidak dapat dibaca.'));reader.readAsDataURL(file);});
  async function prepareFile(file) {
    if(file.size>20*1024*1024)throw new Error('Ukuran berkas asli maksimal 20 MB.');
    if(file.type==='application/pdf')return {name:file.name,mime:file.type,base64:await readBase64(file),size:file.size};
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Gunakan JPG, PNG, WEBP, atau PDF. Konversi HEIC terlebih dahulu.');
    const url=URL.createObjectURL(file),img=new Image();
    try {
      img.src=url;await img.decode();const scale=Math.min(1,1600/Math.max(img.width,img.height));
      const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.78));if(!blob)throw new Error('Foto tidak dapat diproses.');
      return {name:file.name.replace(/\.[^.]+$/,'.jpg'),mime:'image/jpeg',base64:await readBase64(blob),size:blob.size};
    } finally {URL.revokeObjectURL(url);}
  }
  function submissionForm(task) {
    submitKey=crypto.randomUUID();let prepared=[];
    $('lpTaskDetail').innerHTML=`<form id="lpSubmitForm" class="lp-form"><h3>Kumpulkan · ${esc(task.title)}</h3><p>Unggah 1–5 foto/PDF. Foto diperkecil otomatis. Total hasil maksimal 2 MB.</p><label>Pilih foto dari kamera/galeri atau PDF<input id="lpUploadFiles" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple required></label><div id="lpFilePreview" class="lp-file-preview"></div><label>Catatan untuk guru<textarea name="note" maxlength="2000" placeholder="Tuliskan catatan bila diperlukan"></textarea></label><button type="submit" id="lpSendSubmission" disabled>Kirim tugas</button><p class="muted">Pengiriman berhasil setelah nomor bukti muncul. Berkas hanya dapat diakses melalui akunmu dan akun guru/admin.</p></form>`;
    $('lpTaskDetail').scrollIntoView({block:'start'});
    $('lpUploadFiles').onchange=async ev=>{
      const picked=[...ev.target.files];prepared=[];$('lpSendSubmission').disabled=true;$('lpFilePreview').textContent='Memproses foto…';
      try {if(!picked.length||picked.length>5)throw new Error('Pilih 1–5 berkas.');const next=[];for(const f of picked)next.push(await prepareFile(f));
        if(next.reduce((n,f)=>n+f.size,0)>2*1024*1024)throw new Error('Total melebihi 2 MB. Kurangi jumlah halaman atau perkecil PDF.');prepared=next;
        $('lpFilePreview').innerHTML=next.map(f=>`<div>${f.mime.startsWith('image/')?`<img src="data:${f.mime};base64,${f.base64}" alt="Pratinjau ${esc(f.name)}">`:''}<span>${esc(f.name)} · ${Math.ceil(f.size/1024)} KB</span></div>`).join('');$('lpSendSubmission').disabled=false;
      }catch(e){$('lpFilePreview').textContent=e.message;}
    };
    $('lpSubmitForm').onsubmit=async ev=>{
      ev.preventDefault();const f=ev.currentTarget,button=$('lpSendSubmission'),input=$('lpUploadFiles');button.disabled=true;input.disabled=true;notice('Mengunggah tugas… Jangan tutup halaman.');
      try{const r=await api('submit',{taskId:task.id,requestId:submitKey,note:f.elements.note.value,files:prepared.map(({size,...v})=>v)});await load();notice('Tugas berhasil dikumpulkan. Nomor bukti: '+r.id);}
      catch(e){notice(e.message,true);button.disabled=false;input.disabled=false;}
    };
  }
  function renderProfile() {
    const p=data.profile;
    panel().innerHTML=`<div class="lp-profile-head"><span class="lp-avatar">${esc(p.name.slice(0,2).toUpperCase())}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.id)} · ${role==='S'?esc(p.className+' · Kelompok '+p.group):'Guru / Admin'}</p><small>Nama pada data sekolah: ${esc(p.officialName)}</small></div></div><form id="lpProfileForm" class="lp-form"><div class="lp-form-grid"><label>Nama tampilan<input name="name" required maxlength="120" value="${esc(p.name)}"></label><label>Email<input name="email" type="email" maxlength="150" value="${esc(p.email)}"></label><label>Nomor kontak<input name="phone" type="tel" maxlength="40" value="${esc(p.phone)}"></label>${role==='A'?`<label>Mata pelajaran<input name="subject" maxlength="150" value="${esc(p.subject)}"></label>`:''}<label class="lp-wide">Tentang saya<textarea name="bio" maxlength="800">${esc(p.bio)}</textarea></label></div><p class="muted">Data kontak ini hanya tampil pada profil akun sendiri. ID, kelas, kelompok, dan nama sekolah dikelola oleh admin.</p><button type="submit">Simpan profil</button></form>${data.canManageTeachers?`<details class="lp-form"><summary>Akun guru terpisah</summary><p>Setiap guru memiliki profil sendiri. Akun guru memiliki akses pengelolaan yang sama dengan panel admin; berikan hanya kepada guru yang berwenang.</p><form id="lpTeacherForm"><label>ID guru<input name="id" required pattern="[A-Za-z0-9._-]{2,40}" maxlength="40"></label><label>Nama guru<input name="name" required maxlength="120"></label><label>Kata sandi awal<input name="password" type="password" minlength="10" maxlength="80" required autocomplete="new-password"></label><button type="submit">Buat akun guru</button></form><div class="lp-list">${data.teachers.map(t=>`<p>${esc(t.name)} · ${esc(t.id)} · ${t.active?'Aktif':'Tidak aktif'}</p>`).join('')}</div></details>`:''}`;
    $('lpProfileForm').onsubmit=ev=>{ev.preventDefault();const f=ev.currentTarget;run(f.querySelector('button'),()=>api('saveProfile',formValues(f)),'Profil diperbarui.');};
    if($('lpTeacherForm'))$('lpTeacherForm').onsubmit=ev=>{ev.preventDefault();const f=ev.currentTarget;if(!confirm('Buat akun guru dengan akses pengelolaan admin?'))return;run(f.querySelector('button'),()=>api('createTeacher',formValues(f)),'Akun guru dibuat. Bagikan ID dan kata sandi secara pribadi.');};
  }
  document.querySelector('#loginForm').insertAdjacentHTML('afterbegin','<div id="teacherLoginFields" class="hidden"><label class="field" for="teacherLoginId">ID guru (opsional)</label><input id="teacherLoginId" type="text" maxlength="40" autocomplete="username" placeholder="Kosongkan untuk admin utama"></div>');
  window.LearningUI={ mount, syncAdmin(page){if(page==='learning')document.querySelector('#adminView .admin-heading h1').textContent='Ruang pembelajaran';if($('lpShellA'))$('lpShellA').classList.toggle('hidden',page!=='learning');if(page!=='learning'){current.A='home';document.querySelectorAll('[data-lp-role="A"]').forEach(b=>b.classList.remove('active'));}}, loginRole(r){$('teacherLoginFields').classList.toggle('hidden',r!=='A');}, reset(){generation++;data=null;current={S:'home',A:'home'};mount.token='';if($('lpHomeSummary')){$('lpHomeSummary').replaceChildren();$('lpHomeSummary').hidden=true;}document.querySelectorAll('.lp-shell').forEach(n=>n.classList.add('hidden'));document.querySelectorAll('[id^=lpPanel]').forEach(n=>n.replaceChildren());} };
})();
