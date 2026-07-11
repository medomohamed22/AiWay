import crypto from 'node:crypto';
import { requirePiUser } from './_lib/auth.js';
import { modelById } from './_lib/catalog.js';
import { adminDb } from './_lib/db.js';
import { body, json, method, publicError } from './_lib/http.js';

const ROLES = new Set(['user', 'assistant']);
const RATIOS = new Map([['1024x1024',[1024,1024]],['768x1344',[768,1344]],['1344x768',[1344,768]],['1536x640',[1536,640]]]);

function cleanMessages(value, prompt) {
  const list = Array.isArray(value) ? value.slice(-20) : [];
  const clean = list.filter((m) => ROLES.has(m?.role) && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (clean.at(-1)?.role !== 'user' || clean.at(-1)?.content !== prompt) clean.push({ role: 'user', content: prompt });
  return clean;
}

function imageData(result) {
  const images = result?.choices?.[0]?.message?.images;
  const url = images?.[0]?.image_url?.url || images?.[0]?.url;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url || '');
  if (!match) throw Object.assign(new Error('MODEL_DID_NOT_RETURN_SUPPORTED_IMAGE'), { status: 502 });
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw Object.assign(new Error('INVALID_IMAGE_SIZE'), { status: 502 });
  return { buffer, mime: match[1], ext: match[1].split('/')[1].replace('jpeg','jpg') };
}

async function openRouter(model, messages) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_NOT_CONFIGURED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_ORIGIN || 'https://example.invalid',
        'X-Title': 'AIWay'
      },
      body: JSON.stringify({ model: model.id, messages, max_tokens: model.type === 'text' ? 4096 : undefined,
        modalities: model.type === 'image' ? ['image','text'] : undefined })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error('MODEL_PROVIDER_ERROR'), { status: response.status === 429 ? 429 : 502, cause: result });
    return result;
  } finally { clearTimeout(timeout); }
}

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  const requestId = crypto.randomUUID();
  let reservation = null;
  try {
    const user = await requirePiUser(req);
    const input = await body(req);
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
    if (!prompt || prompt.length > 8000) throw Object.assign(new Error('INVALID_PROMPT'), { status: 400 });
    const model = modelById(input.model);
    if (!model) throw Object.assign(new Error('MODEL_NOT_ALLOWED'), { status: 400 });
    const db = adminDb();
    await db.from('users').upsert({ pi_uid: user.uid, username: user.username }, { onConflict: 'pi_uid', ignoreDuplicates: true });
    const reserved = await db.rpc('reserve_tokens', { p_uid: user.uid, p_cost: model.cost, p_request_id: requestId });
    if (reserved.error) {
      const insufficient = reserved.error.message?.includes('INSUFFICIENT_TOKENS');
      throw Object.assign(new Error(insufficient ? 'INSUFFICIENT_TOKENS' : 'RESERVATION_FAILED'), { status: insufficient ? 403 : 409 });
    }
    reservation = { db, user, model };
    const dimensions = RATIOS.get(`${Number(input.width)}x${Number(input.height)}`) || [1024,1024];
    const messages = cleanMessages(input.messages, model.type === 'image'
      ? `${prompt}\nGenerate one image with a ${dimensions[0]}:${dimensions[1]} aspect ratio.` : prompt);
    const result = await openRouter(model, messages);
    const record = { pi_uid: user.uid, request_id: requestId, kind: model.type, model: model.id,
      prompt, token_cost: model.cost, width: dimensions[0], height: dimensions[1] };
    let payload;
    if (model.type === 'image') {
      const image = imageData(result);
      const path = `${user.uid}/${requestId}.${image.ext}`;
      const uploaded = await db.storage.from('aiway-media').upload(path, image.buffer, { contentType: image.mime, upsert: false });
      if (uploaded.error) throw uploaded.error;
      record.media_path = path;
      const saved = await db.from('generations').insert(record);
      if (saved.error) { await db.storage.from('aiway-media').remove([path]); throw saved.error; }
      const signed = await db.storage.from('aiway-media').createSignedUrl(path, 900);
      payload = { imageUrl: signed.data?.signedUrl, width: dimensions[0], height: dimensions[1] };
    } else {
      const content = result?.choices?.[0]?.message?.content;
      const reply = typeof content === 'string' ? content : Array.isArray(content)
        ? content.filter((p) => p?.type === 'text').map((p) => p.text).join('\n') : '';
      if (!reply) throw Object.assign(new Error('EMPTY_MODEL_RESPONSE'), { status: 502 });
      record.response_text = reply.slice(0, 100000);
      const saved = await db.from('generations').insert(record);
      if (saved.error) throw saved.error;
      payload = { reply: record.response_text };
    }
    return json(res, 200, { ...payload, newBalance: Number(reserved.data) });
  } catch (error) {
    if (reservation) await reservation.db.rpc('refund_tokens', {
      p_uid: reservation.user.uid, p_cost: reservation.model.cost, p_request_id: requestId
    }).catch(() => {});
    const out = publicError(error);
    return json(res, out.status, { error: out.message });
  }
}
