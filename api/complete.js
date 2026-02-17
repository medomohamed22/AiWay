// ملف: api/complete.js

import { createClient } from '@supabase/supabase-js';

// Vercel يدعم fetch تلقائياً
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  // 1. التحقق من الطريقة (req.method)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  
  // 2. قراءة البيانات (Vercel يفك تشفير JSON تلقائياً في req.body)
  const { paymentId, txid, pi_uid, username, tokenAmount, usdAmount, pAmount } = req.body;
  
  if (!paymentId || !txid || !pi_uid) {
    return res.status(400).json({ error: 'Missing payment data' });
  }
  
  const PI_SECRET_KEY = process.env.PI_SECRET_KEY;
  const PI_API_BASE = 'https://api.minepi.com/v2';
  
  try {
    // 3. إبلاغ شبكة Pi باكتمال الدفع
    const response = await fetch(`${PI_API_BASE}/payments/${paymentId}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // 4. التعامل مع قاعدة البيانات
      
      // جلب بيانات المستخدم الحالية
      const { data: user } = await supabase
        .from('users')
        .select('token_balance, total_usd_spent, total_pi_spent')
        .eq('pi_uid', pi_uid)
        .single();

      const tokensToAdd = parseInt(tokenAmount || 0);
      const usdToAdd = parseFloat(usdAmount || 0);
      const piToAdd = parseFloat(pAmount || 0);

      let newBalance = tokensToAdd;
      let newTotalUsd = usdToAdd;
      let newTotalPi = piToAdd;

      if (user) {
        // مستخدم قديم: تحديث الرصيد
        newBalance += (user.token_balance || 0);
        newTotalUsd += (user.total_usd_spent || 0);
        newTotalPi += (user.total_pi_spent || 0);

        await supabase.from('users').update({ 
            username: username,
            token_balance: newBalance,
            total_usd_spent: newTotalUsd,
            total_pi_spent: newTotalPi
        }).eq('pi_uid', pi_uid);

      } else {
        // مستخدم جديد: إنشاء سجل
        await supabase.from('users').insert({ 
            pi_uid: pi_uid, 
            username: username,
            token_balance: newBalance,
            total_usd_spent: newTotalUsd,
            total_pi_spent: newTotalPi
        });
      }

      // إرسال الرد بنجاح
      return res.status(200).json({ completed: true, newBalance, data });

    } else {
      // خطأ من Pi Network
      const error = await response.json();
      return res.status(response.status).json({ error });
    }
  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: err.message });
  }
}