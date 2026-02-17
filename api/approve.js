// ملف: api/approve.js

// إعدادات الباقات (يجب أن تتطابق مع الفرونت إند)
const PACKAGES = {
    150: 1,   // 150 توكين = 1 دولار
    750: 5,   // 750 توكين = 5 دولار
    1500: 10  // 1500 توكين = 10 دولار
};

export default async function handler(req, res) {
    // 1. التحقق من طريقة الطلب (Vercel style)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. قراءة البيانات (Vercel يقرأ الـ body تلقائياً كـ JSON)
    const { paymentId } = req.body;

    if (!paymentId) {
        return res.status(400).json({ error: 'Missing paymentId' });
    }

    const PI_SECRET_KEY = process.env.PI_SECRET_KEY;
    const PI_API_BASE = 'https://api.minepi.com/v2';

    try {
        // 3. جلب تفاصيل عملية الدفع من شبكة Pi
        const paymentRes = await fetch(`${PI_API_BASE}/payments/${paymentId}`, {
            headers: { 'Authorization': `Key ${PI_SECRET_KEY}` }
        });
        
        if (!paymentRes.ok) throw new Error("Failed to fetch payment details");
        
        const paymentData = await paymentRes.json();
        const paidAmount = parseFloat(paymentData.amount);
        const metadata = paymentData.metadata; // يحتوي على عدد التوكين المطلوب

        // 4. التحقق من التلاعب في البيانات
        if (!metadata || metadata.type !== 'tokens' || !PACKAGES[metadata.tokenAmount]) {
            return res.status(400).json({ error: "Invalid payment metadata" });
        }

        // 5. جلب سعر العملة الحالي من OKX
        let currentPiPrice = 40.0; // سعر احتياطي
        try {
            const okxRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=PI-USDT');
            const okxData = await okxRes.json();
            if (okxData.data && okxData.data[0]) {
                currentPiPrice = parseFloat(okxData.data[0].last);
            }
        } catch (e) {
            console.error("Price fetch failed in approve, using backup");
        }

        // 6. حساب القيمة المتوقعة ومقارنتها بالمدفوع
        const usdValue = PACKAGES[metadata.tokenAmount];
        const expectedPi = usdValue / currentPiPrice;

        // السماح بهامش خطأ 10%
        const minAcceptedAmount = expectedPi * 0.90;

        if (paidAmount < minAcceptedAmount) {
            console.log(`Fraud Attempt! Expected: ${expectedPi}, Paid: ${paidAmount}`);
            return res.status(400).json({ error: "Price mismatch (Fraud protection)" });
        }

        // 7. الموافقة (Approve)
        const approveRes = await fetch(`${PI_API_BASE}/payments/${paymentId}/approve`, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${PI_SECRET_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}) 
        });

        if (approveRes.ok) {
            return res.status(200).json({ approved: true });
        } else {
            const error = await approveRes.json();
            return res.status(approveRes.status).json({ error });
        }

    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}