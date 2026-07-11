import { requirePiUser } from './_lib/auth.js';
import { adminDb } from './_lib/db.js';
import { json, method, publicError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const user = await requirePiUser(req);
    const admins = new Set((process.env.ADMIN_PI_UIDS || '').split(',').map((x) => x.trim()).filter(Boolean));
    if (!admins.has(user.uid)) throw Object.assign(new Error('FORBIDDEN'), { status: 403 });
    const db = adminDb();
    const [users, generations, payments] = await Promise.all([
      db.from('users').select('*', { count: 'exact', head: true }),
      db.from('generations').select('*', { count: 'exact', head: true }),
      db.from('payments').select('amount_pi,tokens,status,created_at').eq('status', 'completed').order('created_at', { ascending: false }).limit(100)
    ]);
    if (users.error || generations.error || payments.error) throw users.error || generations.error || payments.error;
    json(res, 200, { users: users.count || 0, generations: generations.count || 0, payments: payments.data });
  } catch (error) { const out = publicError(error); json(res, out.status, { error: out.message }); }
}
