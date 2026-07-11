import { requirePiUser } from './_lib/auth.js';
import { packageById } from './_lib/catalog.js';
import { adminDb } from './_lib/db.js';
import { body, json, method, publicError } from './_lib/http.js';

async function piPayment(id) {
  const response = await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Key ${process.env.PI_API_KEY}` }
  });
  if (!response.ok) throw Object.assign(new Error('PI_PAYMENT_LOOKUP_FAILED'), { status: 502 });
  return response.json();
}

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    if (!process.env.PI_API_KEY) throw new Error('PI_NOT_CONFIGURED');
    const user = await requirePiUser(req);
    const input = await body(req);
    const paymentId = String(input.paymentId || '');
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(paymentId)) throw Object.assign(new Error('INVALID_PAYMENT_ID'), { status: 400 });
    const payment = await piPayment(paymentId);
    const pkg = packageById(payment?.metadata?.packageId);
    const price = Number(process.env.PI_USD_PRICE);
    if (!pkg || !Number.isFinite(price) || price <= 0) throw Object.assign(new Error('INVALID_PAYMENT_PACKAGE'), { status: 400 });
    const expected = Number((pkg.usd / price).toFixed(4));
    if (payment.user_uid !== user.uid || Math.abs(Number(payment.amount) - expected) > 0.00000001 || payment.direction !== 'user_to_app') {
      throw Object.assign(new Error('PAYMENT_MISMATCH'), { status: 403 });
    }
    const db = adminDb();
    await db.from('users').upsert({ pi_uid: user.uid, username: user.username }, { onConflict: 'pi_uid', ignoreDuplicates: true });
    const existing = await db.from('payments').select('pi_uid,status,package_id').eq('payment_id', paymentId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data && (existing.data.pi_uid !== user.uid || existing.data.package_id !== pkg.id))
      throw Object.assign(new Error('PAYMENT_MISMATCH'), { status: 403 });
    if (existing.data?.status === 'completed') return json(res, 200, { approved: true, alreadyCompleted: true });
    if (existing.data?.status === 'approved') return json(res, 200, { approved: true, alreadyApproved: true });
    if (!existing.data) {
      const stored = await db.from('payments').insert({ payment_id: paymentId, pi_uid: user.uid,
        package_id: pkg.id, amount_pi: expected, tokens: pkg.tokens, status: 'created' });
      if (stored.error) throw stored.error;
    }
    const approved = await fetch(`https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/approve`, {
      method: 'POST', headers: { Authorization: `Key ${process.env.PI_API_KEY}`, 'Content-Type': 'application/json' }, body: '{}'
    });
    if (!approved.ok) throw Object.assign(new Error('PI_APPROVAL_FAILED'), { status: 502 });
    const updated = await db.from('payments').update({ status: 'approved' }).eq('payment_id', paymentId).eq('pi_uid', user.uid);
    if (updated.error) throw updated.error;
    json(res, 200, { approved: true });
  } catch (error) { const out = publicError(error); json(res, out.status, { error: out.message }); }
}
