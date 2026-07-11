import { requirePiUser } from './_lib/auth.js';
import { adminDb } from './_lib/db.js';
import { json, method, publicError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const user = await requirePiUser(req);
    const { data, error } = await adminDb().from('generations')
      .select('id,kind,model,prompt,response_text,created_at')
      .eq('pi_uid', user.uid).eq('kind', 'text').order('created_at', { ascending: false }).limit(30);
    if (error) throw error;
    json(res, 200, data.reverse().map((row) => ({
      id: row.id, type: 'text', model: row.model, prompt: row.prompt,
      bot_response: row.response_text, created_at: row.created_at
    })));
  } catch (error) { const out = publicError(error); json(res, out.status, { error: out.message }); }
}
