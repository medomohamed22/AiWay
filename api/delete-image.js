import { requirePiUser } from './_lib/auth.js';
import { adminDb } from './_lib/db.js';
import { body, json, method, publicError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const user = await requirePiUser(req);
    const input = await body(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(input.id || ''))) throw Object.assign(new Error('INVALID_ID'), { status: 400 });
    const db = adminDb();
    const found = await db.from('generations').select('id,media_path')
      .eq('id', input.id).eq('pi_uid', user.uid).in('kind', ['image','video']).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) throw Object.assign(new Error('NOT_FOUND'), { status: 404 });
    if (found.data.media_path) {
      const removed = await db.storage.from('aiway-media').remove([found.data.media_path]);
      if (removed.error) throw removed.error;
    }
    const deleted = await db.from('generations').delete().eq('id', input.id).eq('pi_uid', user.uid);
    if (deleted.error) throw deleted.error;
    json(res, 200, { success: true });
  } catch (error) { const out = publicError(error); json(res, out.status, { error: out.message }); }
}
