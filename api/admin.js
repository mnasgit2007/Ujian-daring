import { handler, authAdmin, norm } from './_lib/auth.js';
import { adminSetStatus, adminRotateSessionPin, adminResetAttempt, adminDashboard } from './_lib/exam.js';

export default handler(async (body) => {
  authAdmin(body.token);
  const action = norm(body.action) || 'dashboard';
  if (action === 'dashboard') return await adminDashboard();
  if (action === 'setStatus') return await adminSetStatus(norm(body.examId), norm(body.status));
  if (action === 'rotateSessionPin') return await adminRotateSessionPin(norm(body.examId));
  if (action === 'resetAttempt') return await adminResetAttempt(norm(body.examId), norm(body.studentId));
  throw new Error('Aksi admin tidak dikenal: ' + action);
});
