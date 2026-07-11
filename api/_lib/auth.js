import { bearer } from './http.js';

export async function requirePiUser(req) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://api.minepi.com/v2/me', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
    const user = await response.json();
    if (!user?.uid || !user?.username) throw Object.assign(new Error('UNAUTHORIZED'), { status: 401 });
    return { uid: String(user.uid), username: String(user.username).slice(0, 64) };
  } finally { clearTimeout(timeout); }
}
