// Vercel Serverless Function: /api/generate-and-save
// Keeps GEMINI_API_KEY hidden on the server.

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function safeMessages(messages = []) {
  return Array.isArray(messages)
    ? messages
        .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
        .slice(-12)
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
    : [];
}

async function callGeminiGenerateContent({ model, contents, generationConfig }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig })
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `Gemini request failed with ${r.status}`;
    const err = new Error(msg);
    err.status = r.status;
    err.details = data;
    throw err;
  }
  return data;
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('').trim();
}

function extractImageDataUrl(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return `data:${mime};base64,${inline.data}`;
    }
  }
  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const prompt = String(body.prompt || '').trim();
    const modelFromClient = String(body.model || 'openai-fast');
    if (!prompt) return json(res, 400, { error: 'Missing prompt' });

    const isImage = ['imagen-4', 'gptimage', 'klein', 'klein-large', 'gemini-image'].includes(modelFromClient);

    if (isImage) {
      const width = Number(body.width) || 1024;
      const height = Number(body.height) || 1024;
      const data = await callGeminiGenerateContent({
        model: IMAGE_MODEL,
        contents: [{
          role: 'user',
          parts: [{ text: `${prompt}\n\nGenerate one high quality image. Aspect ratio target: ${width}:${height}. Do not include extra text unless needed.` }]
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      });

      const imageUrl = extractImageDataUrl(data);
      const reply = extractText(data);
      if (!imageUrl) return json(res, 502, { error: 'Gemini returned no image', reply });
      return json(res, 200, { imageUrl, width, height, reply, newBalance: 999 });
    }

    const history = safeMessages(body.messages);
    const contents = history.length ? history : [{ role: 'user', parts: [{ text: prompt }] }];
    if (history.length && contents[contents.length - 1]?.parts?.[0]?.text !== prompt) {
      contents.push({ role: 'user', parts: [{ text: prompt }] });
    }

    const data = await callGeminiGenerateContent({
      model: TEXT_MODEL,
      contents,
      generationConfig: { temperature: 0.7 }
    });

    const reply = extractText(data);
    return json(res, 200, { reply: reply || 'Gemini returned no text.', newBalance: 999 });
  } catch (e) {
    console.error(e);
    return json(res, e.status || 500, {
      error: e.message || 'Server error',
      hint: e.message === 'Missing GEMINI_API_KEY' ? 'Add GEMINI_API_KEY in Vercel Environment Variables.' : undefined
    });
  }
}
