/* Presentation only: summaries use the existing dashboard response. */
(() => {
  const byId = id => document.getElementById(id);
  const art = `<svg viewBox="0 0 360 230" fill="none" aria-hidden="true"><circle cx="185" cy="116" r="103" fill="white" opacity=".09"/><rect x="73" y="53" width="218" height="140" rx="16" fill="#fff"/><rect x="88" y="70" width="79" height="105" rx="8" fill="#ede9fe"/><path d="M102 92h49m-49 15h38m-38 15h44m-44 15h30" stroke="#a998e8" stroke-width="5" stroke-linecap="round"/><path d="M191 85h77m-77 17h60m-60 17h70" stroke="#d1c7f5" stroke-width="6" stroke-linecap="round"/><circle cx="238" cy="156" r="25" fill="#f6b94b"/><path d="m225 156 9 9 18-19" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="m45 181 43-12-8 40z" fill="#f6b94b"/><rect x="266" y="22" width="56" height="44" rx="10" transform="rotate(12 266 22)" fill="#3d3066"/><path d="m280 44 9 7 16-13" stroke="white" stroke-width="3" stroke-linecap="round"/><path d="m41 71 9-17 9 17-9 17z" stroke="#fff" stroke-width="2"/><circle cx="307" cy="200" r="6" fill="#f6b94b"/></svg>`;
  document.querySelector('.login-story h2').innerHTML = 'Selamat datang di<br><span>ruang belajarmu.</span>';
  document.querySelector('.login-story p').textContent = 'Satu ruang untuk belajar, mengikuti ujian, dan melihat hasil usahamu.';
  document.querySelector('.login-story').insertAdjacentHTML('beforeend', '<div class="learning-art">'+art+'</div>');
  const student = byId('studentView');
  student.insertAdjacentHTML('afterbegin', `<aside class="student-rail" aria-label="Ruang siswa"><div class="rail-brand"><span class="rail-logo">M</span><strong>Ruang Belajar<small>SMKN 1 Manggelewa</small></strong></div><nav aria-label="Navigasi siswa"><a class="active" href="#studentView">⌂ <span>Dashboard</span></a><a href="#examList">▤ <span>Daftar ujian</span></a></nav><div class="rail-note"><span>SEMANGAT BELAJAR</span><strong>Langkah kecil,<br>kemajuan besar.</strong><p>Kerjakan dengan tenang dan percaya pada kemampuanmu.</p></div></aside>`);
  student.querySelector('.welcome').insertAdjacentHTML('beforeend', '<div class="welcome-art">'+art+'</div>');
  student.querySelector('.welcome').insertAdjacentHTML('afterend', `<div class="student-summary" aria-label="Ringkasan ujian"><article class="learning-progress"><div><span class="eyebrow">Perjalanan belajarmu</span><h2>Progres ujian</h2><p id="uiStudentProgressText">Belum ada ujian</p></div><div id="uiStudentRing" class="progress-ring"><strong id="uiStudentPercent">0%</strong></div></article><article class="student-count"><span class="metric-icon">▤</span><strong id="uiStudentAvailable">0</strong><span>Siap dikerjakan</span></article><article class="student-count"><span class="metric-icon amber">✓</span><strong id="uiStudentDone">0</strong><span>Ujian selesai</span></article></div>`);
  student.insertAdjacentHTML('beforeend', `<aside class="student-guide"><span class="eyebrow">Ruang siswa</span><h2>Siap untuk hari ini?</h2><p id="uiStudentDate"></p><div class="guide-divider"></div><span class="guide-step">01</span><h3>Pilih ujianmu</h3><p>Lihat jadwal dan status ujian yang tersedia untuk kelasmu.</p><span class="guide-step">02</span><h3>Siapkan diri</h3><p>Pastikan koneksi stabil. Siapkan PIN sesi jika diminta guru.</p><span class="guide-step">03</span><h3>Kerjakan dengan jujur</h3><p>Jawaban tersimpan otomatis. Periksa kembali sebelum mengumpulkan.</p><div class="guide-tip">Butuh bantuan?<br><strong>Hubungi guru pengampu.</strong></div></aside>`);
  document.querySelector('#adminView .admin-heading').insertAdjacentHTML('afterend', `<div class="admin-overview"><div class="overview-copy"><span class="eyebrow">SMKN 1 Manggelewa</span><h2>Selamat datang, Bapak / Ibu Guru</h2><p>Ruang kendali kelas, ujian, dan kehadiran siswa.</p></div><div class="overview-metrics"><article><span>Siswa aktif</span><strong id="uiActiveStudents">0</strong></article><article><span>Kelas aktif</span><strong id="uiActiveClasses">0</strong></article><article><span>Ujian dibuka</span><strong id="uiOpenExams">0</strong></article><article><span>Sesi absensi terbuka</span><strong id="uiOpenAttendance">0</strong></article></div></div>`);
  window.ReferenceUI = {
    student(data) {
      const exams = data.exams || [];
      const done = exams.filter(exam => ['SELESAI', 'WAKTU_HABIS'].includes(exam.state)).length;
      const percent = exams.length ? Math.round(done / exams.length * 100) : 0;
      byId('uiStudentPercent').textContent = percent + '%';
      byId('uiStudentRing').style.setProperty('--progress', percent + '%');
      byId('uiStudentProgressText').textContent = exams.length ? done + ' dari ' + exams.length + ' ujian selesai' : 'Belum ada ujian untuk kelasmu';
      byId('uiStudentAvailable').textContent = exams.filter(exam => ['TERSEDIA', 'LANJUTKAN'].includes(exam.state)).length;
      byId('uiStudentDone').textContent = done;
      byId('uiStudentDate').textContent = new Intl.DateTimeFormat('id-ID', {timeZone:'Asia/Makassar', weekday:'long', day:'numeric', month:'long', year:'numeric'}).format(new Date());
    },
    admin(data) {
      byId('uiActiveStudents').textContent = (data.students || []).filter(s => s.active).length;
      byId('uiActiveClasses').textContent = (data.classes || []).filter(c => c.active).length;
      byId('uiOpenExams').textContent = (data.exams || []).filter(e => e.status === 'BUKA').length;
      byId('uiOpenAttendance').textContent = (data.attendanceSessions || []).filter(s => s.status === 'BUKA').length;
    }
  };
})();
