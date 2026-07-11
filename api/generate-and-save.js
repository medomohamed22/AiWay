// Vercel Serverless Function: /api/generate-and-save
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// أسعار الموديلات الافتراضية بناءً على تكلفة التشغيل أو رغبتك (معرفات OpenRouter الرسمية)
const MODEL_COSTS = {
    // موديلات الصور
    'black-forest-labs/flux-schnell': 1,
    'stabilityai/stable-diffusion-xl': 2,
    
    // موديلات النصوص/المحادثة
    'google/gemini-2.5-flash': 1,
    'meta-llama/llama-3-8b-instruct': 1,
    'openai/gpt-4o-mini': 2
};

function sendJson(res, statusCode, body) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
}

async function readBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
    
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
}

// دالة استخراج رابط الصورة أو النص المرجوع من OpenRouter
function parseOpenRouterResponse(data, isImage) {
    const content = data?.choices?.[0]?.message?.content || '';
    if (!isImage) return { text: content };
    
    // إذا كان موديل صور، نبحث عن رابط الصورة داخل النص المرجوع
    const markdownUrlMatch = content.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
    if (markdownUrlMatch) return { imageUrl: markdownUrlMatch[1] };
    
    const directUrlMatch = content.match(/(https?:\/\/[^\s]+)/);
    if (directUrlMatch) return { imageUrl: directUrlMatch[1] };
    
    return { imageUrl: content }; // قد يعود الرابط أو الـ base64 مباشرة
}

// التصدير باستخدام نظام ES Modules الحديث المتوافق مع إعدادات مشروعك
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    
    let uploadedFileName = null;
    
    try {
        const body = await readBody(req);
        const { prompt, username, pi_uid, model, width, height, messages } = body;
        
        if (!prompt || !username || !pi_uid) {
            return sendJson(res, 400, { error: "Missing data (prompt, username, or pi_uid)" });
        }
        
        // تحديد الموديل والخصم الافتراضي
        const selectedModel = model || 'google/gemini-2.5-flash';
        const cost = MODEL_COSTS[selectedModel] || 3; // 3 توكن افتراضي إذا لم يكن في القائمة
        
        // معرفة نوع الطلب (صور أم نصوص) بناءً على اسم الموديل المشحون
        const isImage = selectedModel.includes('flux') || selectedModel.includes('diffusion') || selectedModel.includes('stable');
        
        // 1. التحقق من الرصيد في Supabase
        const { data: userCheck, error: checkError } = await supabase
            .from('users')
            .select('token_balance')
            .eq('pi_uid', pi_uid)
            .single();
        
        if (checkError || !userCheck) {
            return sendJson(res, 403, { error: 'INSUFFICIENT_TOKENS', currentBalance: 0 });
        }
        
        if (userCheck.token_balance < cost) {
            return sendJson(res, 403, {
                error: 'INSUFFICIENT_TOKENS',
                required: cost,
                currentBalance: userCheck.token_balance
            });
        }
        
        // 2. الاتصال بـ OpenRouter API
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        if (!openRouterKey) {
            throw new Error('Missing OPENROUTER_API_KEY in environment variables');
        }
        
        // تجهيز الـ Messages للطلب
        let apiMessages = [];
        if (!isImage && Array.isArray(messages) && messages.length > 0) {
            apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
            // التأكد من إدراج الـ prompt الأخير في نهاية المصفوفة إن لم يكن موجوداً
            if (apiMessages[apiMessages.length - 1]?.content !== prompt) {
                apiMessages.push({ role: 'user', content: prompt });
            }
        } else {
            // طلب صورة أو طلب نصي بسيط بدون تاريخ محادثة
            const contentText = isImage ?
                `${prompt}\n\nCreate one high-quality image. Aspect ratio: ${width || 1024}x${height || 1024}.` :
                prompt;
            apiMessages = [{ role: 'user', content: contentText }];
        }
        
        const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openRouterKey}`,
                'HTTP-Referer': process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
                'X-Title': 'Pi Network App'
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: apiMessages,
                temperature: 0.7,
                ...(isImage && { aspect_ratio: `${width || 1024}:${height || 1024}` }) // لبعض موديلات الصور الداعمة
            })
        });
        
        if (!openRouterRes.ok) {
            const errData = await openRouterRes.json().catch(() => ({}));
            throw new Error(`OpenRouter Failed: ${errData?.error?.message || openRouterRes.statusText}`);
        }
        
        const openRouterData = await openRouterRes.json();
        const parsedResult = parseOpenRouterResponse(openRouterData, isImage);
        
        let finalPayload = {};
        
        // 3. إذا كان طلب صورة: نقوم بتحميلها ثم رفعها لـ Supabase Bucket
        if (isImage) {
            if (!parsedResult.imageUrl) {
                throw new Error("OpenRouter didn't return an image URL.");
            }
            
            const downloadRes = await fetch(parsedResult.imageUrl);
            if (!downloadRes.ok) throw new Error(`Failed to download generated image from remote URL`);
            
            const arrayBuffer = await downloadRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // رفع الصورة لـ Supabase Storage
            uploadedFileName = `${username}_${Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage
                .from('nano_images')
                .upload(uploadedFileName, buffer, { contentType: 'image/jpeg' });
            
            if (uploadError) throw uploadError;
            
            const { data: publicUrlData } = supabase.storage.from('nano_images').getPublicUrl(uploadedFileName);
            finalPayload.imageUrl = publicUrlData.publicUrl;
            
            // حفظ السجل في جدول الصور
            await supabase.from('user_images').insert([{ pi_username: username, prompt: prompt, image_url: finalPayload.imageUrl }]);
        } else {
            // إذا كان نصاً عاديًا
            finalPayload.reply = parsedResult.text || 'No text returned';
        }
        
        // 4. خصم الرصيد من قاعدة البيانات (بعد التأكد من نجاح العملية السابقة)
        const { data: userFinal } = await supabase.from('users').select('token_balance').eq('pi_uid', pi_uid).single();
        
        if (!userFinal || userFinal.token_balance < cost) {
            throw new Error("INSUFFICIENT_TOKENS_LATE");
        }
        
        const newBalance = userFinal.token_balance - cost;
        await supabase.from('users').update({ token_balance: newBalance }).eq('pi_uid', pi_uid);
        
        finalPayload.success = true;
        finalPayload.newBalance = newBalance;
        
        return sendJson(res, 200, finalPayload);
        
    } catch (error) {
        console.error("Handler Error:", error);
        
        // تنظيف الملف المرفوع في حال حدوث خطأ مفاجئ أثناء العملية
        if (uploadedFileName) {
            await supabase.storage.from('nano_images').remove([uploadedFileName]).catch(() => {});
        }
        
        if (error.message === "INSUFFICIENT_TOKENS_LATE") {
            return sendJson(res, 403, { error: 'INSUFFICIENT_TOKENS' });
        }
        return sendJson(res, 500, { error: error.message });
    }
}
