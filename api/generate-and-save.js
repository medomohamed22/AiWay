// ملف: api/generate-and-save.js

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const MODEL_COSTS = {
    'imagen-4': 1,
    'klein': 2,
    'klein-large': 4,
    'gptimage': 5,
    'grok-video': 5,          // ✅ Grok Video = 5 توكين
    'openai-large': 3,
    'openai-fast': 1,
    'openai': 1
};

const VIDEO_MODELS = ['grok-video'];   // ✅ قائمة موديلات الفيديو

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let uploadedFileName = null;

    try {
        const { prompt, username, pi_uid, model, width, height, messages } = req.body;

        if (!prompt || !username || !pi_uid) {
            return res.status(400).json({ error: "بيانات ناقصة" });
        }

        const selectedModel = model ? model.trim() : 'imagen-4';
        const POLLINATIONS_KEY = process.env.POLLINATIONS_API_KEY || "";

        const isVideo = VIDEO_MODELS.includes(selectedModel);
        const isChat = selectedModel.includes('openai') || selectedModel.includes('gpt-5') || (messages && messages.length > 0);
        const cost = MODEL_COSTS[selectedModel] || 5;

        // التحقق من الرصيد
        const { data: userCheck } = await supabase
            .from('users')
            .select('token_balance')
            .eq('pi_uid', pi_uid)
            .single();

        if (!userCheck || userCheck.token_balance < cost) {
            return res.status(403).json({ error: 'INSUFFICIENT_TOKENS' });
        }

        let botReply = null;
        let finalMediaUrl = null;
        let mediaType = isVideo ? 'video' : 'image';

        if (isChat) {
            // ... (كود الشات بدون تغيير)
            console.log("Processing Chat Request:", selectedModel);
            // (الكود القديم للشات كاملاً هنا - ما تغيرش)
            let finalMessages = messages || [];
            const systemMsg = { role: "system", content: "You are a helpful assistant. Use Markdown for code." };
            if (finalMessages.length === 0 || finalMessages[0].role !== 'system') finalMessages.unshift(systemMsg);
            if (finalMessages.length === 1 && prompt) finalMessages.push({ role: "user", content: prompt });

            const headers = { "Content-Type": "application/json" };
            if (POLLINATIONS_KEY) headers["Authorization"] = `Bearer ${POLLINATIONS_KEY}`;

            const chatResponse = await fetch(`https://gen.pollinations.ai/v1/chat/completions?key=${encodeURIComponent(POLLINATIONS_KEY)}`, {
                method: "POST", headers, body: JSON.stringify({ model: selectedModel, messages: finalMessages })
            });

            if (!chatResponse.ok) throw new Error(`Chat API Error: ${chatResponse.status}`);
            const chatData = await chatResponse.json();
            botReply = chatData.choices[0].message.content;

        } else {
            // ✅ مسار الفيديو والصور الجديد
            console.log(`Processing ${isVideo ? 'VIDEO' : 'IMAGE'} Request:`, selectedModel);

            const seed = Math.floor(Math.random() * 1000000);
            let targetUrl = `https://gen.pollinations.ai/image/\( {encodeURIComponent(prompt)}?model= \){selectedModel}&seed=${seed}&nologo=true`;

            // للفيديو: نمنع width/height عشان ما يطلعش 400
            if (!isVideo) {
                const safeWidth = width || 1024;
                const safeHeight = height || 1024;
                targetUrl += `&width=\( {safeWidth}&height= \){safeHeight}`;
            }

            if (POLLINATIONS_KEY) targetUrl += `&key=${encodeURIComponent(POLLINATIONS_KEY)}`;

            const mediaRes = await fetch(targetUrl);
            if (!mediaRes.ok) throw new Error(`Gen Failed: ${mediaRes.status}`);

            const arrayBuffer = await mediaRes.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const ext = isVideo ? 'mp4' : 'jpg';
            const contentType = isVideo ? 'video/mp4' : 'image/jpeg';
            uploadedFileName = `\( {username}_ \){Date.now()}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from('nano_images')
                .upload(uploadedFileName, buffer, { contentType });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage.from('nano_images').getPublicUrl(uploadedFileName);
            finalMediaUrl = publicUrlData.publicUrl;
        }

        // خصم التوكين
        const { data: userFinal } = await supabase.from('users').select('token_balance').eq('pi_uid', pi_uid).single();
        const newBalance = userFinal.token_balance - cost;
        await supabase.from('users').update({ token_balance: newBalance }).eq('pi_uid', pi_uid);

        // حفظ في قاعدة البيانات + الرد
        if (isChat) {
            await supabase.from('user_images').insert([{ pi_uid, pi_username: username, prompt, bot_response: botReply, type: 'text' }]);
            return res.status(200).json({ success: true, reply: botReply, newBalance, type: 'text' });
        } else {
            await supabase.from('user_images').insert([{
                pi_uid,
                pi_username: username,
                prompt,
                [isVideo ? 'video_url' : 'image_url']: finalMediaUrl,
                type: mediaType
            }]);

            return res.status(200).json({
                success: true,
                [isVideo ? 'videoUrl' : 'imageUrl']: finalMediaUrl,
                newBalance,
                type: mediaType
            });
        }

    } catch (error) {
        console.error("Handler Error:", error);
        if (uploadedFileName) await supabase.storage.from('nano_images').remove([uploadedFileName]);
        return res.status(500).json({ error: error.message });
    }
}
