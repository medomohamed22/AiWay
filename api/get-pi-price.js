// ملف: api/get-pi-price.js

export default async function handler(req, res) {
    // إعدادات CORS للسماح للفرونت إند بطلب السعر
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // التعامل مع طلبات OPTIONS (Preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // 1. تحديد رابط API الخاص بـ OKX
        const symbol = "PI-USDT";
        const okxUrl = `https://www.okx.com/api/v5/market/ticker?instId=${symbol}`;

        // 2. طلب البيانات من OKX
        // في Vercel، دالة fetch مدعومة تلقائياً ولا تحتاج لـ require
        const response = await fetch(okxUrl);
        
        if (!response.ok) {
            throw new Error(`OKX API Error: ${response.statusText}`);
        }
        
        const data = await response.json();

        // 3. التحقق من صحة البيانات
        if (data.code !== "0" || !data.data || data.data.length === 0) {
            throw new Error("Invalid Data from OKX");
        }

        // استخراج السعر
        const price = parseFloat(data.data[0].last);

        // 4. إرسال الرد مع الكاش
        // Vercel يستخدم setHeader للكاش
        res.setHeader('Cache-Control', 'public, max-age=10');
        
        return res.status(200).json({ price: price });

    } catch (error) {
        console.error("Price Fetch Error:", error);
        
        // --- Fallback: CoinGecko ---
        try {
            const fallbackResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pi-network&vs_currencies=usd');
            const fallbackData = await fallbackResponse.json();
            const fallbackPrice = fallbackData['pi-network'].usd;
            
            return res.status(200).json({ price: fallbackPrice, source: "fallback" });
        } catch (fallbackError) {
            // إذا فشل المصدران
            return res.status(500).json({ error: "Failed to fetch price from OKX and Fallback" });
        }
    }
}
