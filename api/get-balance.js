// ملف: api/get-balance.js

import { createClient } from '@supabase/supabase-js';

// تهيئة Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    // 1. استخراج UID من الـ Query Parameters
    // في Vercel نستخدم req.query بدلاً من event.queryStringParameters
    const { uid } = req.query;

    if (!uid) {
        return res.status(400).json({ error: 'Missing UID' });
    }

    // 2. الاستعلام من قاعدة البيانات
    const { data, error } = await supabase
        .from('users')
        .select('token_balance')
        .eq('pi_uid', uid)
        .single();

    // 3. معالجة الأخطاء
    // الرمز PGRST116 يعني أنه لم يتم العثور على سجلات (مستخدم جديد)، وهذا ليس خطأ في السيرفر
    if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: error.message });
    }

    // 4. إرجاع الرصيد
    // إذا لم يوجد مستخدم (data null)، نرجع الرصيد 0
    return res.status(200).json({ 
        balance: data ? data.token_balance : 0 
    });
}