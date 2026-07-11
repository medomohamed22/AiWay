import { requirePiUser } from './_lib/auth.js';
import { adminDb } from './_lib/db.js';
import { json, method, publicError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const user = await requirePiUser(req);
    const db = adminDb();
    const { data, error } = await db.from('generations')
      .select('id,kind,model,prompt,media_path,width,height,created_at')
      .eq('pi_uid', user.uid).in('kind', ['image','video'])
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const rows = await Promise.all(data.map(async (row) => {
      const signed = await db.storage.from('aiway-media').createSignedUrl(row.media_path, 900);
      return { ...row, url: signed.data?.signedUrl || null };
    }));
    json(res, 200, rows.filter((row) => row.url));
  } catch (error) { const out = publicError(error); json(res, out.status, { error: out.message }); }
}
