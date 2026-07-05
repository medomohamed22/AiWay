// Vercel Serverless Function: /api/generate-and-save
// Gemini API key stays hidden on the server.

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-preview-image-generation';

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function safeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function callGemini({ model, contents, generationConfig }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    const err = new Error('Missing GEMINI_API_KEY');
    err.statusCode = 500;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(data?.error?.message || `Gemini error ${response.status}`);
    err.statusCode = response.status;
    err.details = data;
    throw err;
  }
  return data;
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('').trim();
}

function extractImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return `data:${mime};base64,${inline.data}`;
    }
  }
  return '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = await readBody(req);
    const prompt = String(body.prompt || '').trim();
    const clientModel = String(body.model || 'openai-fast');

    if (!prompt) return sendJson(res, 400, { error: 'Missing prompt' });

    const imageModels = new Set(['imagen-4', 'gptimage', 'klein', 'klein-large', 'gemini-image']);
    const isImage = imageModels.has(clientModel);

    if (isImage) {
      const width = Number(body.width) || 1024;
      const height = Number(body.height) || 1024;
      const data = await callGemini({
        model: IMAGE_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${prompt}\n\nCreate one high-quality image. Target aspect ratio: ${width}:${height}.`
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE']
        }
      });

      const imageUrl = extractImage(data);
      const reply = extractText(data);
      if (!imageUrl) {
        return sendJson(res, 502, {
          error: 'Gemini returned no image. Check GEMINI_IMAGE_MODEL or use chat model.',
          reply
        });
      }
      return sendJson(res, 200, { imageUrl, width, height, reply, newBalance: 999 });
    }

    const history = safeMessages(body.messages);
    const contents = history.length ? history : [{ role: 'user', parts: [{ text: prompt }] }];
    const lastText = contents[contents.length - 1]?.parts?.[0]?.text;
    if (lastText !== prompt) contents.push({ role: 'user', parts: [{ text: prompt }] });

    const data = await callGemini({
      model: TEXT_MODEL,
      contents,
      generationConfig: { temperature: 0.7 }
    });

    return sendJson(res, 200, {
      reply: extractText(data) || 'Gemini returned no text.',
      newBalance: 999
    });
  } catch (error) {
    console.error('generate-and-save failed:', error);
    return sendJson(res, error.statusCode || 500, {
      error: error.message || 'Server error',
      details: error.details || undefined,
      hint:
        error.message === 'Missing GEMINI_API_KEY'
          ? 'Add GEMINI_API_KEY in Vercel Project Settings > Environment Variables, then redeploy.'
          : undefined
    });
  }
};
