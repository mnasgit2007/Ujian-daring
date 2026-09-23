import { handler, authAdmin, norm } from './_lib/auth.js';
import { adminSetStatus, adminRotateSessionPin, adminResetAttempt, adminDashboard, adminListQuestions, adminCreateQuestion, adminUpdateQuestion, adminDeleteQuestion, adminCreateClass, adminAssignStudentClass } from './_lib/exam.js';

export default handler(async (body) => {
  authAdmin(body.token);
  const action = norm(body.action) || 'dashboard';
  if (action === 'dashboard') return await adminDashboard();
  if (action === 'createClass') return await adminCreateClass(body);
  if (action === 'assignStudentClass') return await adminAssignStudentClass(body);
  if (action === 'setStatus') return await adminSetStatus(norm(body.examId), norm(body.status));
  if (action === 'rotateSessionPin') return await adminRotateSessionPin(norm(body.examId));
  if (action === 'resetAttempt') return await adminResetAttempt(norm(body.examId), norm(body.studentId));
  if (action === 'listQuestions') return await adminListQuestions(norm(body.examId));
  if (action === 'createQuestion') return await adminCreateQuestion(body);
  if (action === 'updateQuestion') return await adminUpdateQuestion(body);
  if (action === 'deleteQuestion') return await adminDeleteQuestion(norm(body.examId), norm(body.questionId));
  throw new Error('Aksi admin tidak dikenal: ' + action);
});
