// ملف: api/generate-and-save.js

const { createClient } = require('@supabase/supabase-js');

// Vercel يدعم fetch تلقائياً في البيئات الحديثة
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODEL_COSTS = {
    'imagen-4': 1,
    'klein': 2,
    'klein-large': 4,
    'gptimage': 5,
    'grok-video': 5,          // ✅ الموديل الجديد Grok Video
    'openai-large': 3,
    'openai-fast': 1,
    'openai': 1
};

// 1. تغيير تعريف الدالة الرئيسي
export default async function handler(req, res) {
    
    // 2. التحقق من الطريقة (req.method)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let uploadedFileName = null;

    try {
        // 3. قراءة البيانات مباشرة من req.body (بدون parsing)
        const { prompt, username, pi_uid, model, width, height, messages } = req.body;

        if (!prompt || !username || !pi_uid) {
            return res.status(400).json({ error: "بيانات ناقصة" });
        }

        const selectedModel = model ? model.trim() : 'imagen-4';
        const POLLINATIONS_KEY = process.env.POLLINATIONS_API_KEY || ""; 

        const isChat = selectedModel.includes('openai') || selectedModel.includes('gpt-5') || (messages && messages.length > 0);
        const cost = MODEL_COSTS[selectedModel] || 5;

        // --- التحقق من الرصيد ---
        const { data: userCheck, error: checkError } = await supabase
            .from('users')
            .select('token_balance')
            .eq('pi_uid', pi_uid)
            .single();

        if (checkError || !userCheck) {
            return res.status(403).json({ error: 'User Check Failed' });
        }

        if (userCheck.token_balance < cost) {
            return res.status(403).json({ error: 'INSUFFICIENT_TOKENS', currentBalance: userCheck.token_balance });
        }

        let botReply = null;
        let finalImageUrl = null;

        // --- التنفيذ ---
        if (isChat) {
            console.log("Processing Chat Request (Vercel):", selectedModel);

            let finalMessages = messages || [];
            const systemMsg = { role: "system", content: "You are a helpful assistant. Use Markdown for code." };
            
            if (finalMessages.length === 0 || finalMessages[0].role !== 'system') {
                finalMessages.unshift(systemMsg);
            }
            if (finalMessages.length === 1 && prompt) {
                finalMessages.push({ role: "user", content: prompt });
            }

            const headers = { "Content-Type": "application/json" };
            if (POLLINATIONS_KEY) headers["Authorization"] = `Bearer ${POLLINATIONS_KEY}`;

            const chatUrl = `https://gen.pollinations.ai/v1/chat/completions?key=${encodeURIComponent(POLLINATIONS_KEY)}`;

            const chatResponse = await fetch(chatUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify({ model: selectedModel, messages: finalMessages })
            });

            if (!chatResponse.ok) {
                const errTxt = await chatResponse.text();
                if (chatResponse.status === 401 && !POLLINATIONS_KEY) {
                    throw new Error("Missing API Key in Server Env");
                }
                throw new Error(`Chat API Error: ${chatResponse.status} - ${errTxt}`);
            }

            const chatData = await chatResponse.json();
            botReply = chatData.choices[0].message.content;

        } else {
            // مسار الصور (Grok Video هيشتغل هنا)
            console.log("Processing Image Request (Vercel):", selectedModel);
            const safeWidth = width || 1024;
            const safeHeight = height || 1024;
            const seed = Math.floor(Math.random() * 1000000);
            
            let targetUrl = `https://gen.pollinations.ai/image/\( {encodeURIComponent(prompt)}?model= \){selectedModel}&width=\( {safeWidth}&height= \){safeHeight}&seed=${seed}&nologo=true`;
            if (POLLINATIONS_KEY) targetUrl += `&key=${encodeURIComponent(POLLINATIONS_KEY)}`;

            const imageRes = await fetch(targetUrl);
            if (!imageRes.ok) throw new Error(`Image Gen Failed: ${imageRes.status}`);
            
            const arrayBuffer = await imageRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            uploadedFileName = `\( {username}_ \){Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage.from('nano_images').upload(uploadedFileName, buffer, { contentType: 'image/jpeg' });
            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('nano_images').getPublicUrl(uploadedFileName);
            finalImageUrl = publicUrlData.publicUrl;
        }

        // --- خصم الرصيد ---
        const { data: userFinal } = await supabase.from('users').select('token_balance').eq('pi_uid', pi_uid).single();
        if (!userFinal || userFinal.token_balance < cost) throw new Error("INSUFFICIENT_TOKENS_LATE");
        
        const newBalance = userFinal.token_balance - cost;
        await supabase.from('users').update({ token_balance: newBalance }).eq('pi_uid', pi_uid);

        // --- الحفظ والرد ---
        if (isChat) {
            try {
                await supabase.from('user_images').insert([{ 
                    pi_uid: pi_uid, pi_username: username, prompt: prompt, bot_response: botReply, type: 'text' 
                }]);
            } catch (dbErr) { console.error("DB Error", dbErr); }

            // 4. الرد بصيغة Vercel
            return res.status(200).json({ success: true, reply: botReply, newBalance, type: 'text' });
        } else {
            try {
                await supabase.from('user_images').insert([{ 
                    pi_uid: pi_uid, pi_username: username, prompt: prompt, image_url: finalImageUrl, type: 'image' 
                }]);
            } catch (dbErr) { console.error("DB Error", dbErr); }

            return res.status(200).json({ success: true, imageUrl: finalImageUrl, newBalance, type: 'image' });
        }

    } catch (error) {
        console.error("Handler Error:", error);
        if (uploadedFileName) await supabase.storage.from('nano_images').remove([uploadedFileName]);
        
        if (error.message === "INSUFFICIENT_TOKENS_LATE") {
            return res.status(403).json({ error: 'INSUFFICIENT_TOKENS' });
        }
        
        return res.status(500).json({ error: error.message });
    }
}
