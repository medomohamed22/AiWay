// ملف: api/delete-image.js

import { createClient } from '@supabase/supabase-js';

// Vercel يدعم fetch تلقائياً
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    // 1. التحقق من طريقة الطلب
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // 2. قراءة البيانات (Vercel يفك تشفير JSON تلقائياً)
        const { id, username } = req.body;

        if (!id || !username) {
            return res.status(400).json({ error: "Missing id or username" });
        }

        // ---------------------------------------------------------
        // خطوة 1: جلب بيانات السجل (لمعرفة هل هو صورة أم شات)
        // ---------------------------------------------------------
        const { data: record, error: fetchError } = await supabase
            .from('user_images')
            .select('image_url, type') // جلبنا النوع والرابط
            .match({ id: id, pi_username: username })
            .single();

        if (fetchError || !record) {
            console.error("Record not found or access denied");
            return res.status(404).json({ error: "Record not found" });
        }

        // ---------------------------------------------------------
        // خطوة 2: حذف الملف من Storage (فقط لو كان صورة وله رابط)
        // ---------------------------------------------------------
        if (record.image_url) {
            // استخراج اسم الملف من الرابط
            const fileName = record.image_url.split('/').pop();

            if (fileName) {
                const { error: storageError } = await supabase
                    .storage
                    .from('nano_images')
                    .remove([fileName]);

                if (storageError) {
                    console.error("Storage delete warning:", storageError);
                    // نكمل العملية حتى لو فشل حذف الملف الفيزيائي
                }
            }
        }

        // ---------------------------------------------------------
        // خطوة 3: حذف السجل من قاعدة البيانات
        // ---------------------------------------------------------
        const { error: dbError } = await supabase
            .from('user_images')
            .delete()
            .match({ id: id, pi_username: username });

        if (dbError) {
            return res.status(500).json({ error: dbError.message });
        }

        // إرجاع رد النجاح
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("Handler error:", error);
        return res.status(500).json({ error: error.message });
    }
}