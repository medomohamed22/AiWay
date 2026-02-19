// ملف: api/get-admin-stats.js

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // 1. التحقق من أن الطلب من نوع POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // قراءة المتغيرات البيئية (Environment Variables)
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const ADMIN_SECRET = process.env.ADMIN_PASSWORD || "MySuperSecretPass123";

        // التحقق من إعدادات Supabase حتى لا يتعطل السيرفر فجأة
        if (!supabaseUrl || !supabaseKey) {
            console.error("خطأ: متغيرات Supabase غير موجودة في Vercel");
            return res.status(500).json({ error: "Server Configuration Error" });
        }

        // تهيئة اتصال Supabase
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 2. قراءة كلمة المرور المرسلة من الواجهة (HTML)
        const { password } = req.body || {};

        // 3. التحقق من صحة كلمة المرور
        if (password !== ADMIN_SECRET) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        // 4. جلب كافة المستخدمين وبياناتهم من قاعدة البيانات
        const { data: users, error } = await supabase
            .from('users')
            .select('username, token_balance, total_usd_spent, total_pi_spent, created_at')
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        // 5. حساب إجمالي الأرباح والإحصائيات
        let totalUSD = 0;
        let totalPi = 0;

        // التأكد من أن المصفوفة تحتوي على بيانات قبل اللوب
        if (users && users.length > 0) {
            users.forEach(u => {
                totalUSD += (u.total_usd_spent || 0);
                totalPi += (u.total_pi_spent || 0);
            });
        }

        // 6. إرسال البيانات النهائية لوظيفة renderDashboard في الـ HTML
        return res.status(200).json({
            users: users || [],
            stats: {
                totalUSD,
                totalPi,
                totalUsers: users ? users.length : 0
            }
        });

    } catch (error) {
        console.error("Admin API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
