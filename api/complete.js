import { requirePiUser } from './_lib/auth.js';
import { adminDb } from './_lib/db.js';
import { body, json, method, publicError } from './_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    if (!process.env.PI_API_KEY) throw new Error('PI_NOT_CONFIGURED');
    const user = await requirePiUser(req);
    const input = await body(req);
    const paymentId = String(input.paymentId || '');
    const txid = String(input.txid || '');
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(paymentId) || !/^[A-Za-z0-9_-]{8,128}$/.test(txid))
      throw Object.assign(new Error('INVALID_PAYMENT_DATA'), { status: 400 });
    const db = adminDb();
    const owned = await db.from('payments').select('status').eq('payment_id', paymentId).eq('pi_uid', user.uid).maybeSingle();
    if (owned.error) throw owned.error;
    if (!owned.data) throw Object.assign(new Error('PAYMENT_NOT_FOUND'), { status: 404 });
    if (owned.data.status !== 'completed') {
      const completed = await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/complete`, {
        method: 'POST', headers: { Authorization: `Key ${process.env.PI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ txid })
      });
      if (!completed.ok) throw Object.assign(new Error('PI_COMPLETION_FAILED'), { status: 502 });
    }
    const credited = await db.rpc('credit_completed_payment', { p_payment_id: paymentId, p_txid: txid });
    if (credited.error) throw credited.error;
    json(res, 200, { success: true, newBalance: Number(credited.data) });
  } catch (error) { const out = publicError(error); json(res, out.status, { error: out.message }); }
}
