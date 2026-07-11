// Vercel Serverless Function: /api/generate-and-save
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// أسعار الموديلات المعتمدة رسمياً في السيرفر بناءً على معرفات OpenRouter
const MODEL_COSTS = {
    // موديلات الصور
    'black-forest-labs/flux-schnell': 1,
    'stabilityai/stable-diffusion-xl': 2,
    
    // موديلات النصوص والمحادثة
    'google/gemini-2.5-flash': 1,
    'meta-llama/llama-3-8b-instruct': 1,
    'openai/gpt-4o-mini': 2,

    // عائلة DeepSeek
    'deepseek/deepseek-chat': 1,       // DeepSeek V3 للمحادثات السريعة
    'deepseek/deepseek-r1': 3          // DeepSeek R1 للتفكير المعقد والبرمجة
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

// دالة استخراج النص أو رابط الصورة المرجوع من OpenRouter بدقة
function parseOpenRouterResponse(data, isImage) {
    const content = data?.choices?.[0]?.message?.content || '';
    if (!isImage) return { text: content };
    
    // البحث عن رابط الصورة داخل النص المرجوع (في حال الـ Markdown أو الرابط المباشر)
    const markdownUrlMatch = content.match(/!\[.*?\]\((https?:\/\/.*?)\)/);
    if (markdownUrlMatch) return { imageUrl: markdownUrlMatch[1] };
    
    const directUrlMatch = content.match(/(https?:\/\/[^\s]+)/);
    if (directUrlMatch) return { imageUrl: directUrlMatch[1] };
    
    return { imageUrl: content.trim() };
}

export default async function handler(req, res) {
    // السماح فقط بطلبات POST
    if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method Not Allowed' });
    }
    
    // 1. فحص توكن شبكة Pi لتوثيق المستخدم وحمايته من الـ IDOR
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendJson(res, 401, { error: "Missing or invalid authorization token format" });
    }
    const piAccessToken = authHeader.split(' ')[1];
    
    let verifiedUser = null;
    let uploadedFileName = null;
    
    try {
        // التحقق من التوكن مع سيرفرات Pi Network الرسمية
        const piAuthRes = await fetch('https://api.minepi.com/v2/me', {
            headers: { 'Authorization': `Bearer ${piAccessToken}` }
        });
        
        if (!piAuthRes.ok) {
            return sendJson(res, 401, { error: "Unauthorized / Invalid Pi Access Token" });
        }
        
        // استخراج بيانات المستخدم الحقيقية والموثقة بنجاح
        verifiedUser = await piAuthRes.json(); // تحتوي على { uid, username }
        
    } catch (authErr) {
        console.error("Pi Gate Auth Error:", authErr);
        return sendJson(res, 500, { error: "Internal Auth Gateway Timeout" });
    }
    
    try {
        const body = await readBody(req);
        const { prompt, model, width, height, messages } = body;
        
        if (!prompt) {
            return sendJson(res, 400, { error: "Missing prompt data" });
        }
        
        // ربط الحساب الموثق
        const pi_uid = verifiedUser.uid;
        const username = verifiedUser.username;
        
        // تحديد الموديل وحساب التكلفة الفعلي من السيرفر لمنع تلاعب العميل بالأسعار
        const selectedModel = model || 'google/gemini-2.5-flash';
        const cost = MODEL_COSTS[selectedModel] !== undefined ? MODEL_COSTS[selectedModel] : 3;
        
        const isImage = selectedModel.includes('flux') || selectedModel.includes('diffusion') || selectedModel.includes('stable');
        
        // 2. التحقق من الرصيد داخل Supabase بناءً على الـ uid الموثق
        let { data: userCheck, error: checkError } = await supabase
            .from('users')
            .select('token_balance')
            .eq('pi_uid', pi_uid)
            .single();
            
        // إذا كان المستخدم جديداً تماماً ولم يسجل من قبل، ننشئ له سجلاً برصيد ترحيبي
        if (checkError && checkError.code === 'PGRST116') { 
            const { data: newUser, error: createError } = await supabase
                .from('users')
                .insert([{ pi_uid, username, token_balance: 100 }])
                .select()
                .single();
                
            if (createError) throw createError;
            userCheck = newUser;
        } else if (checkError) {
            throw checkError;
        }
        
        if (userCheck.token_balance < cost) {
            return sendJson(res, 403, {
                error: 'INSUFFICIENT_TOKENS',
                required: cost,
                currentBalance: userCheck.token_balance
            });
        }
        
        // 3. إعداد الاتصال والطلب بـ OpenRouter API
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        if (!openRouterKey) {
            throw new Error('Missing OPENROUTER_API_KEY in server environment variables');
        }
        
        let apiMessages = [];
        if (!isImage && Array.isArray(messages) && messages.length > 0) {
            // تنظيف وترتيب مصفوفة المحادثة السابقة وإرسالها بالكامل للموديل للنصوص
            apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
            if (apiMessages[apiMessages.length - 1]?.content !== prompt) {
                apiMessages.push({ role: 'user', content: prompt });
            }
        } else {
            // طلب صورة أو نص منفرد مباشر
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
                'X-Title': 'Pi Network AI App'
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: apiMessages,
                temperature: 0.7,
                ...(isImage && { aspect_ratio: `${width || 1024}:${height || 1024}` })
            })
        });
        
        if (!openRouterRes.ok) {
            const errData = await openRouterRes.json().catch(() => ({}));
            throw new Error(`OpenRouter Failed: ${errData?.error?.message || openRouterRes.statusText}`);
        }
        
        const openRouterData = await openRouterRes.json();
        const parsedResult = parseOpenRouterResponse(openRouterData, isImage);
        
        let finalPayload = {};
        
        // 4. معالجة وحفظ مخرجات الصور في الـ Bucket الخاص بـ Supabase
        if (isImage) {
            if (!parsedResult.imageUrl) {
                throw new Error("OpenRouter didn't return a valid image URL.");
            }
            
            const downloadRes = await fetch(parsedResult.imageUrl);
            if (!downloadRes.ok) throw new Error(`Failed to stream generated image from OpenRouter Node`);
            
            const arrayBuffer = await downloadRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            uploadedFileName = `${username}_${Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage
                .from('nano_images')
                .upload(uploadedFileName, buffer, { contentType: 'image/jpeg' });
            
            if (uploadError) throw uploadError;
            
            const { data: publicUrlData } = supabase.storage.from('nano_images').getPublicUrl(uploadedFileName);
            finalPayload.imageUrl = publicUrlData.publicUrl;
            
            // حفظ السجل الموثق في جدول الصور الخاص بالمعرض
            await supabase.from('user_images').insert([{ 
                pi_uid: pi_uid, 
                pi_username: username, 
                prompt: prompt, 
                image_url: finalPayload.imageUrl 
            }]);
        } else {
            // معالجة مخرجات النصوص
            finalPayload.reply = parsedResult.text || 'No text content returned';
        }
        
        // 5. خصم التوكنز الفعلي بعد التأكد من نجاح توليد المحتوى بالكامل
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
        console.error("Handler Process Failure:", error);
        
        // تنظيف وحذف الصورة المرفوعة لحماية المساحة التخزينية في حال حدوث خطأ لاحق بالتوليد
        if (uploadedFileName) {
            await supabase.storage.from('nano_images').remove([uploadedFileName]).catch(() => {});
        }
        
        if (error.message === "INSUFFICIENT_TOKENS_LATE") {
            return sendJson(res, 403, { error: 'INSUFFICIENT_TOKENS' });
        }
        return sendJson(res, 500, { error: error.message });
    }
}
