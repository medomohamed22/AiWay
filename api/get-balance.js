import { requirePiUser } from './_lib/auth.js';
import { adminDb } from './_lib/db.js';
import { json, method, publicError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const user = await requirePiUser(req);
    const db = adminDb();
    const { data, error } = await db.from('users').upsert(
      { pi_uid: user.uid, username: user.username },
      { onConflict: 'pi_uid', ignoreDuplicates: true }
    ).select('token_balance').single();
    if (error) {
      const current = await db.from('users').select('token_balance').eq('pi_uid', user.uid).single();
      if (current.error) throw current.error;
      return json(res, 200, { balance: Number(current.data.token_balance) });
    }
    return json(res, 200, { balance: Number(data.token_balance) });
  } catch (error) { const out = publicError(error); return json(res, out.status, { error: out.message }); }
}
