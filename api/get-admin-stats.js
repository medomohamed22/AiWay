// ملف: api/admin-users.js

import { createClient } from '@supabase/supabase-js';

// تهيئة Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// كلمة السر (تأكد من إضافتها في Environment Variables في Vercel)
const ADMIN_SECRET = process.env.ADMIN_PASSWORD || "MySuperSecretPass123";

export default async function handler(req, res) {
    // 1. التحقق من طريقة الطلب
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 2. قراءة البيانات (Vercel يفك تشفير JSON تلقائياً)
        const { password } = req.body;

        // 3. التحقق من كلمة المرور
        if (password !== ADMIN_SECRET) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // 4. جلب كافة المستخدمين وبياناتهم المالية
        const { data: users, error } = await supabase
            .from('users')
            .select('username, token_balance, total_usd_spent, total_pi_spent, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 5. حساب الإجماليات
        let totalUSD = 0;
        let totalPi = 0;

        users.forEach(u => {
            totalUSD += (u.total_usd_spent || 0);
            totalPi += (u.total_pi_spent || 0);
        });

        // 6. إرسال البيانات
        return res.status(200).json({
            users: users,
            stats: {
                totalUSD,
                totalPi,
                totalUsers: users.length
            }
        });

    } catch (error) {
        console.error("Admin API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}