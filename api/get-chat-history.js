// ملف: api/get-chat-history.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // إعداد CORS للسماح بالوصول من أي مكان
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // التعامل مع طلبات OPTIONS (Preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. استخراج username من الرابط (Query Params)
  // في Vercel نستخدم req.query
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: "Missing username" });
  }

  try {
    // 2. جلب آخر 50 رسالة (الأحدث أولاً)
    const { data, error } = await supabase
      .from('user_images')
      .select('*')
      .eq('pi_username', username)
      .order('created_at', { ascending: false }) // الأحدث أولاً
      .limit(50);

    if (error) throw error;

    // 3. عكس الترتيب ليظهر من الأقدم للأحدث في الشات
    const result = Array.isArray(data) ? data.reverse() : [];

    // 4. إرسال الرد
    return res.status(200).json(result);

  } catch (error) {
    console.error("Fetch Error:", error);
    return res.status(500).json({ error: error.message });
  }
}