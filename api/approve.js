// ملف: api/approve.js

// إعدادات الباقات
const PACKAGES = {
    150: 1,   // 150 توكين = 1 دولار
    750: 5,   // 750 توكين = 5 دولار
    1500: 10  // 1500 توكين = 10 دولار
};

export default async function handler(req, res) {
    // 1. التحقق من طريقة الطلب
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. قراءة البيانات
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
        const metadata = paymentData.metadata;

        // 4. التحقق من التلاعب في البيانات
        if (!metadata || metadata.type !== 'tokens' || !PACKAGES[metadata.tokenAmount]) {
            return res.status(400).json({ error: "Invalid payment metadata" });
        }

        // 5. جلب سعر العملة الحالي من OKX (إجباري)
        let currentPiPrice = null;
        try {
            const okxRes = await fetch('https://www.okx.com/api/v5/market/ticker?instId=PI-USDT');
            if (!okxRes.ok) throw new Error("OKX API Error");
            
            const okxData = await okxRes.json();
            if (okxData.data && okxData.data[0]) {
                currentPiPrice = parseFloat(okxData.data[0].last);
            }
        } catch (e) {
            console.error("Price fetch failed:", e);
            // لا يوجد سعر احتياطي، نوقف العملية ونرجع خطأ
            return res.status(502).json({ error: "Failed to fetch live Pi price from OKX. Please try again later." });
        }

        // تأكد أخير من أن السعر رقم صحيح وموجب
        if (!currentPiPrice || isNaN(currentPiPrice) || currentPiPrice <= 0) {
            return res.status(502).json({ error: "Invalid price data received from exchange." });
        }

        // 6. حساب القيمة المتوقعة ومقارنتها بالمدفوع
        const usdValue = PACKAGES[metadata.tokenAmount];
        const expectedPi = usdValue / currentPiPrice;

        // السماح بهامش خطأ 10% لتذبذب السعر اللحظي
        const minAcceptedAmount = expectedPi * 0.90;

        if (paidAmount < minAcceptedAmount) {
            console.log(`Fraud Attempt! Price: ${currentPiPrice}, Expected: ${expectedPi}, Paid: ${paidAmount}`);
            return res.status(400).json({ error: "Price mismatch (Fraud protection). Price updated, please try again." });
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
