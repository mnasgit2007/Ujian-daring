import { handler, verifyToken } from './_lib/auth.js';
import { learning } from './_lib/learning.js';
import { academic } from './_lib/academic.js';

export default handler(async body => {
  const p = verifyToken(body.token);
  switch(body.action || 'dashboard') {
    case 'academic': return academic.dashboard(p,body);
    case 'saveRoster': return academic.saveRoster(p,body);
    case 'saveSchedule': return academic.saveSchedule(p,body);
    case 'endSchedule': return academic.endSchedule(p,body);
    case 'cancelMeeting': return academic.cancelMeeting(p,body);
    case 'openMeeting': return academic.openMeeting(p,body);
    case 'dashboard': return learning.dashboard(p);
    case 'saveMaterial': return learning.saveContent(p,body,'material');
    case 'saveTask': return learning.saveContent(p,body,'task');
    case 'markAttendance': return learning.markAttendance(p,body);
    case 'saveProfile': return learning.saveProfile(p,body);
    case 'savePhoto': return learning.savePhoto(p,body);
    case 'createTeacher': return learning.createTeacher(p,body);
    case 'submit': return learning.submit(p,body);
    case 'grade': return learning.grade(p,body);
    case 'download': return learning.download(p,body);
    case 'checkStorage': return learning.checkStorage(p);
    default: throw new Error('Aksi pembelajaran tidak dikenal.');
  }
});
