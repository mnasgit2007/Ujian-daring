import { handler, verifyToken } from './_lib/auth.js';
import { dashboardSiswa, adminDashboard } from './_lib/exam.js';

export default handler(async (body) => {
  const payload = verifyToken(body.token);
  if (payload.role === 'A') return await adminDashboard();
  const dash = await dashboardSiswa(payload.id);
  return dash;
});
