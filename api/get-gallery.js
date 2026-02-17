// ملف: api/get-gallery.js

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // إعدادات CORS (ضرورية للسماح للفرونت إند بالوصول)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  // التعامل مع طلبات Preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. استلام البيانات (في Vercel نستخدم req.query)
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: "Missing username" });
  }

  try {
    // 2. الاستعلام من قاعدة البيانات
    const { data, error } = await supabase
      .from('user_images')
      .select('id, image_url, created_at, type')
      .eq('pi_username', username)       // الفلترة باسم المستخدم
      .eq('type', 'image')               // ✅ صور فقط
      .not('image_url', 'is', null)      // ✅ استبعاد null
      .neq('image_url', '')              // ✅ استبعاد الفاضي
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // 3. تنسيق البيانات
    const images = (Array.isArray(data) ? data : []).map((row) => ({
      id: row.id,
      url: row.image_url
    }));

    // 4. إرسال الرد
    return res.status(200).json(images);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}