// دالة النسخ الذكية (تقرأ من الصفحة مباشرة)
function copyCodeFromBlock(btn) {
    // 1. العثور على الحاوية الأب (code-wrapper)
    const wrapper = btn.closest('.code-wrapper');
    if (!wrapper) return;

    // 2. العثور على عنصر الكود داخل الحاوية
    const codeElement = wrapper.querySelector('code');
    if (!codeElement) return;

    // 3. جلب النص كما هو مكتوب
    const textToCopy = codeElement.innerText || codeElement.textContent;

    // 4. النسخ للحافظة
    navigator.clipboard.writeText(textToCopy).then(() => {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
        // Fallback للأجهزة القديمة
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        btn.innerHTML = '✅ Copied!';
    });
}


/* =========================
   CONFIG
   ========================= */
const MODELS = [
    { id: 'openai-large', category: 'Chat & Vision', name: 'GPT-5.2', type: 'text', cost: 3, desc: 'Deep Reasoning' },
    { id: 'openai-fast', category: 'Chat & Vision', name: 'GPT-5 Nano', type: 'text', cost: 1, desc: 'Fast Chat' },
    { id: 'openai', category: 'Chat & Vision', name: 'GPT-5 Mini', type: 'text', cost: 1, desc: 'Balanced' },
    
    { id: 'imagen-4', category: 'Image Generation', name: 'Imagen 4', type: 'image', cost: 1, desc: 'High Quality' },
    { id: 'gptimage', category: 'Image Generation', name: 'Chat GPT Image', type: 'image', cost: 5, desc: 'Creative' },
    { id: 'klein', category: 'Image Generation', name: 'FLUX.2 Klein 4B', type: 'image', cost: 2, desc: 'Fast Gen' },
    { id: 'klein-large', category: 'Image Generation', name: 'FLUX.2 Klein 9B', type: 'image', cost: 4, desc: 'Detailed' },
    
    // ==================== قسم الفيديو الخاص ====================
    { id: 'grok-video', category: 'Video Generation', name: 'Grok Video', type: 'image', cost: 5, desc: 'Grok Powered Video' }
];

const RATIOS = [
    { id: 'square', label: '1:1', w: 1024, h: 1024, icon: '<rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>' },
    { id: 'portrait', label: '9:16', w: 768, h: 1344, icon: '<rect x="6" y="3" width="12" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>' },
    { id: 'landscape', label: '16:9', w: 1344, h: 768, icon: '<rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>' },
    { id: 'wide', label: '21:9', w: 1536, h: 640, icon: '<rect x="2" y="8" width="20" height="8" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>' }
];

const PACKAGES = [
    { usd: 1, tokens: 150 },
    { usd: 5, tokens: 750 },
    { usd: 10, tokens: 1500 }
];

const TRANSLATIONS = {
    ar: {
        gallery: "معرضي", welcome: "أهلاً بك في AIWay <br> اختر الموديل واكتب ما تتخيله",
        placeholder: "تخيل أي شيء...", generating: "جاري الإنشاء...", download: "تحميل",
        delete: "حذف", error: "خطأ", galleryTitle: "معرض صوري", buyTitle: "شراء توكين",
        noImages: "لا توجد صور محفوظة.", confirmDel: "هل أنت متأكد من الحذف؟", wait: "انتظر",
        sec: "ث", noImage: "مفيش صورة للتحميل",
        buy: "شراء", tokens: "توكين", pi: "π", noTokens: "رصيد التوكين نفذ 😢", buyNow: "شراء الآن",
        cost: "توكين", done: "تم", desc: "توليد صور احترافية باستخدام أحدث تقنيات الذكاء الاصطناعي",
        login: "Pi Login", features: "الموقع يدعم", soon: "قريباً", usd: "دولار",
        dlTitle: "تم نسخ رابط الصورة! 📋",
        dlDesc: "بسبب قيود متصفح Pi حالياً، يرجى لصق الرابط في متصفح Google Chrome ليتم تنزيل الصورة فوراً.\nهذا حل مؤقت حتى يتم تحديث المتصفح.",
        rateLimit: "ضغط عالي! انتظر 25 ثانية..."
    },
    en: {
        gallery: "Gallery", welcome: "Welcome to AIWay <br> Select a model and imagine.",
        placeholder: "Imagine anything...", generating: "Generating...", download: "Download",
        delete: "Delete", error: "Error", galleryTitle: "My Gallery", buyTitle: "Buy Tokens",
        noImages: "No saved images.", confirmDel: "Are you sure?", wait: "Wait",
        sec: "s", noImage: "No image to download",
        buy: "Buy", tokens: "Tokens", pi: "π", noTokens: "Out of Tokens 😢", buyNow: "Buy Now",
        cost: "Tokens", done: "Done", desc: "Generate professional images using state-of-the-art AI technologies",
        login: "Pi Login", features: "Site Supports", soon: "Soon", usd: "USD",
        dlTitle: "Link Copied! 📋",
        dlDesc: "Due to Pi Browser limitations, please paste this link into Google Chrome to download the image immediately.\nThis is a temporary solution.",
        rateLimit: "High traffic! Wait 25s..."
    }
};

/* =========================
   STATE
   ========================= */
let currentLang = 'en';
let currentModel = 'imagen-4';
let currentWidth = 1024;
let currentHeight = 1024;
let currentRatioId = 'square';
let piUser = null;
let chatHistory = [];
let cooldownEndTime = 0;
let currentPiPrice = 40.0;

/* =========================
   SAFE HELPERS (FIXES)
   ========================= */
function safeRemove(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function normalizeMessages(list) {
    return (Array.isArray(list) ? list : [])
        .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-12);
}

function renderMarkdownSafe(markdown) {
    const md = String(markdown || "");
    let dirty = "";
    try { dirty = marked.parse(md); } catch (e) { dirty = md; }

    let safe = dirty;
    if (window.DOMPurify && typeof DOMPurify.sanitize === "function") {
        safe = DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
    }

    // fallback لو الـ markdown خرج فاضي أو اتكسر
    const plain = (safe || "").replace(/<[^>]*>/g, '').trim();
    if (!plain || plain.length < 2) {
        const escaped = md
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return `<pre style="white-space:pre-wrap; margin:0; font-family:monospace; color:#ddd;">${escaped}</pre>`;
    }
    return safe;
}

/* =========================
   MARKED CONFIG (CLEAN)
   ========================= */
const renderer = new marked.Renderer();
renderer.code = function(code, language) {
    const validLang = language || 'plaintext';
    // تنظيف الكود للعرض فقط
    const escapedCode = String(code || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // نضع الكود داخل <pre><code> بشكل طبيعي
    // الزر الآن يستدعي دالة تبحث عن الكود المجاور
    return `
    <div class="code-wrapper">
        <div class="code-header">
            <span class="code-lang">${validLang}</span>
            <button class="copy-code-btn" type="button" onclick="copyCodeFromBlock(this)">
                📋 Copy Code
            </button>
        </div>
        <pre><code class="language-${validLang}">${escapedCode}</code></pre>
    </div>`;
};
marked.setOptions({ renderer: renderer });

function copyCodeBlock(btn) {
    // جلب الكود المشفر من خاصية data-code
    const encodedData = btn.getAttribute('data-code');
    if (!encodedData) return;
    
    try {
        // فك التشفير
        const code = decodeURIComponent(encodedData);
        // استدعاء دالة النسخ الأصلية
        copyText(btn, code);
    } catch (e) {
        console.error("Copy Error:", e);
    }
}


function copyText(btn, text) {
    const value = String(text || "");
    navigator.clipboard.writeText(value).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ Copied!';
        setTimeout(() => { btn.innerHTML = originalText; }, 2000);
    }).catch(err => {
        console.error('Failed to copy', err);
        // fallback
        try {
            const ta = document.createElement("textarea");
            ta.value = value;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            const originalText = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            setTimeout(() => { btn.innerHTML = originalText; }, 2000);
        } catch {
            alert("Could not copy text.");
        }
    });
}

const Pi = window.Pi;

document.addEventListener('DOMContentLoaded', () => {
    try { Pi.init({ version: "2.0", sandbox: false }); } catch (e) { console.error("Pi Init Error:", e); }

    renderModelMenu();
    renderAspectMenu();
    updateAspectUI();
    applyLanguage('en');
    updateHeaderModelUI(); // ✅ FIX: بعد applyLanguage علشان placeholder يبقى صح حسب نوع الموديل
    fetchPiPrice();
    setInterval(fetchPiPrice, 10000);
});

async function fetchPiPrice() {
    try {
        const res = await fetch('/api/get-pi-price');
        const data = await res.json();
        if (data.price) {
            currentPiPrice = data.price;
            if (document.getElementById('buyModal').style.display === 'flex') {
                renderBuyGrid();
            }
        }
    } catch(e) { console.log("Using default price"); }
}

function toggleLanguage() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    const label = currentLang === 'ar' ? 'EN' : 'AR';
    document.getElementById('langBtn').textContent = label;
    document.getElementById('landingLangBtn').textContent = label;
    applyLanguage(currentLang);
    updateHeaderModelUI(); // ✅ FIX: لضمان placeholder الصحيح حسب نوع الموديل
}

function applyLanguage(lang) {
    const t = TRANSLATIONS[lang];
    document.getElementById('txtGallery').textContent = t.gallery;
    document.getElementById('emptyMsg').innerHTML = t.welcome;
    document.getElementById('promptInput').placeholder = t.placeholder;
    document.getElementById('txtGalleryTitle').textContent = t.galleryTitle;
    document.getElementById('txtBuyTitle').textContent = t.buyTitle;
    document.getElementById('txtLandingDesc').textContent = t.desc;
    document.getElementById('txtLogin').textContent = t.login;
    document.getElementById('txtFeaturesTitle').textContent = t.features;

    const soonVideo = document.getElementById('txtSoonVideo');
    const soonText = document.getElementById('txtSoonText');
    if (soonVideo) soonVideo.textContent = t.soon;
    if (soonText) soonText.textContent = t.soon;

    document.getElementById('txtDlTitle').textContent = t.dlTitle;
    document.getElementById('txtDlDesc').innerHTML = t.dlDesc.replace(/\n/g, '<br>');

    renderModelMenu();
    renderBuyGrid();
}

async function authenticatePi() {
    try {
        const scopes = ['username', 'payments'];
        const auth = await Pi.authenticate(scopes, onIncompletePayment);
        if (auth.user) {
            piUser = auth.user;
            document.getElementById('landingPage').style.display = 'none';
            fetchBalance();
            loadChatHistory();
        }
    } catch (err) { console.error(err); alert("Auth Failed"); }
}

function onIncompletePayment(payment) { console.log("Incomplete Payment", payment); }

async function fetchBalance() {
    if (!piUser) return;
    try {
        const res = await fetch(`/api/get-balance?uid=${piUser.uid}`);
        const data = await res.json();
        document.getElementById('tokenBalance').textContent = data.balance || 0;
    } catch (e) { console.error("Balance Error", e); }
}

function updateHeaderModelUI() {
    const m = MODELS.find(x => x.id === currentModel) || MODELS[0];
    currentModel = m.id;

    const badge = `<span class="header-cost-badge">${m.cost}</span>`;
    document.getElementById('headerModelName').innerHTML = `${m.name} ${badge}`;

    const aspectBtn = document.getElementById('aspectTriggerBtn');
    const input = document.getElementById('promptInput');
    const t = TRANSLATIONS[currentLang];

    if (m.type === 'text') {
        aspectBtn.style.display = 'none';
        input.placeholder = (currentLang === 'ar') ? "اسأل أي شيء..." : "Ask me anything...";
    } else {
        aspectBtn.style.display = 'flex';
        input.placeholder = t.placeholder;
    }
}

function renderModelMenu() {
    const menu = document.getElementById('modelMenu');
    menu.innerHTML = '';

    const categories = [...new Set(MODELS.map(m => m.category))];

    categories.forEach(cat => {
        const title = document.createElement('div');
        title.className = 'menu-category-title';
        title.innerText = cat;
        menu.appendChild(title);

        const catModels = MODELS.filter(m => m.category === cat);

        catModels.forEach(m => {
            const div = document.createElement('div');
            div.className = `menu-option ${m.id === currentModel ? 'active' : ''}`;
            div.onclick = () => selectModel(m);

            const tagType = m.type === 'image' ? 'tag-img' : 'tag-txt';
            const tagLabel = m.type === 'image' ? 'IMG' : 'CHAT';

            div.innerHTML = `
                <div>
                    <div style="font-weight:700; font-size:14px; color:white; display:flex; align-items:center;">
                        ${m.name}
                    </div>
                    <div style="font-size:11px; color:#888; margin-top:3px;">
                        <span class="model-tag ${tagType}">${tagLabel}</span> ${m.desc}
                    </div>
                </div>
                <div style="font-size:11px; font-weight:bold; color:var(--pi-gold); background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:6px;">
                    ${m.cost} </div>
            `;
            menu.appendChild(div);
        });
    });
}

function selectModel(m) {
    currentModel = m.id;
    updateHeaderModelUI();
    toggleModelMenu();
    renderModelMenu();
}

function toggleModelMenu() {
    const menu = document.getElementById('modelMenu');
    const chevron = document.getElementById('modelChevron');
    const isHidden = menu.style.display === 'none' || menu.style.display === '';
    menu.style.display = isHidden ? 'flex' : 'none';
    chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    if (isHidden) document.getElementById('aspectMenu').style.display = 'none';
}

function renderAspectMenu() {
    const menu = document.getElementById('aspectMenu');
    menu.innerHTML = '';
    RATIOS.forEach(r => {
        const div = document.createElement('div');
        div.className = `menu-option ${r.id === currentRatioId ? 'active' : ''}`;
        div.onclick = () => selectRatio(r);
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="color:white;">${r.icon}</svg>
                <span style="font-size:13px; font-weight:600; color:white;">${r.label}</span>
            </div>
        `;
        menu.appendChild(div);
    });
}

function selectRatio(r) {
    currentWidth = r.w;
    currentHeight = r.h;
    currentRatioId = r.id;
    updateAspectUI();
    document.getElementById('aspectMenu').style.display = 'none';
    renderAspectMenu();
}

function updateAspectUI() {
    const r = RATIOS.find(x => x.id === currentRatioId) || RATIOS[0];
    document.getElementById('currentAspectLabel').textContent = r.label;
    document.getElementById('currentAspectIcon').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">${r.icon}</svg>`;
}

function toggleAspectMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('aspectMenu');
    const isHidden = menu.style.display === 'none' || menu.style.display === '';
    menu.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) document.getElementById('modelMenu').style.display = 'none';
}

function openBuyModal() { renderBuyGrid(); document.getElementById('buyModal').style.display = 'flex'; }

function renderBuyGrid() {
    const grid = document.getElementById('buyGrid');
    grid.innerHTML = '';
    const t = TRANSLATIONS[currentLang];
    PACKAGES.forEach(pkg => {
        const piAmount = (pkg.usd / currentPiPrice).toFixed(4);
        const div = document.createElement('div');
        div.className = 'buy-card';
        div.onclick = () => buyTokens(pkg, piAmount);
        div.innerHTML = `
            <div class="buy-info">
                <span class="buy-amount">${pkg.tokens} ${t.tokens}</span>
                <span class="buy-cost" style="color:#aaa; font-size:11px;">$${pkg.usd}</span>
                <span class="buy-cost">${piAmount} ${t.pi}</span>
            </div>
            <svg class="buy-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
        `;
        grid.appendChild(div);
    });
}

async function buyTokens(pkg, piAmount) {
    if (!piUser) { alert("Login first"); return; }
    try {
        const paymentData = {
            amount: parseFloat(piAmount),
            memo: `${pkg.tokens} Tokens - AIWay`,
            metadata: { type: "tokens", tokenAmount: pkg.tokens, pi_uid: piUser.uid }
        };
        await Pi.createPayment(paymentData, {
           onReadyForServerApproval: async (paymentId) => {
    const res = await fetch('/api/approve', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, // ✅✅ هذا السطر هو الحل
        body: JSON.stringify({ paymentId }) 
    });
    
    if (!res.ok) {
        // نصيحة: اقرأ الخطأ لتعرف السبب بدقة
        const errData = await res.json();
        console.error("Approve Error:", errData);
        throw new Error("Approval Failed");
    }
},
           onReadyForServerCompletion: async (paymentId, txid) => {
    const res = await fetch('/api/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // ✅ تأكد من وجود هذا السطر
        body: JSON.stringify({
            paymentId,
            txid,
            pi_uid: piUser.uid,
            username: piUser.username,
            tokenAmount: pkg.tokens,
            usdAmount: pkg.usd,
            pAmount: paymentData.amount
        })
    });
    // ... باقي الكود
                if (!res.ok) throw new Error("Completion Failed");
                const data = await res.json();
                document.getElementById('tokenBalance').textContent = data.newBalance;
                document.getElementById('buyModal').style.display = 'none';
                alert(`+${pkg.tokens} Tokens!`);
            },
            onCancel: (paymentId) => { console.log("Cancelled"); },
            onError: (error) => { console.error("Error", error); }
        });
    } catch (e) { console.error(e); alert("Payment Failed"); }
}

function updateCooldownUI() {
    const now = Date.now();
    const btn = document.getElementById('sendBtn');
    const icon = document.getElementById('sendIcon');
    const countEl = document.getElementById('countdownEl');
    const t = TRANSLATIONS[currentLang];
    if (now < cooldownEndTime) {
        const remaining = Math.ceil((cooldownEndTime - now) / 1000);
        btn.disabled = true; icon.style.display = 'none'; countEl.style.display = 'block';
        countEl.innerText = `${t.wait}\n${remaining}${t.sec}`;
        requestAnimationFrame(updateCooldownUI);
    } else {
        btn.disabled = false; icon.style.display = 'block'; countEl.style.display = 'none';
    }
}

function triggerCooldown(seconds) {
    cooldownEndTime = Date.now() + (seconds * 1000);
    updateCooldownUI();
}

async function fetchWithRetry(url, options, retries = 2) {
    let lastErr = null;
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, options);

            // ✅ FIX: رجّع الريسبونس حتى لو 403/429/500 عشان نقرأ رسالة الخطأ
            if (res) return res;
        } catch (e) {
            lastErr = e;
        }
        await new Promise(r => setTimeout(r, 1200));
    }
    throw lastErr || new Error("Request failed after retries");
}

async function sendPrompt() {
  if (Date.now() < cooldownEndTime) return;
  
  const input = document.getElementById('promptInput');
  const text = input.value.trim();
  if (!text || !piUser) return;
  
  input.value = '';
  addMessage(text, 'user');
  
  const m = MODELS.find(x => x.id === currentModel) || MODELS[0];
  const isChat = m.type === 'text';
  const loadingId = renderLoader(isChat);
  
  triggerCooldown(5);
  
  try {
    // ✅ ابعت prompt دايمًا (ده اللي بيمنع Missing data)
    let payload = {
      prompt: String(text),
      username: piUser.username,
      pi_uid: piUser.uid,
      model: currentModel
    };
    
    if (isChat) {
      // ✅ ابعت messages كمان لو شات
      payload.messages = [...normalizeMessages(chatHistory), { role: "user", content: String(text) }];
    } else {
      // ✅ ابعت المقاسات لو صورة
      payload.width = currentWidth;
      payload.height = currentHeight;
    }
    
    const response = await fetchWithRetry('/api/generate-and-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const status = response.status;
    let data = {};
    try { data = await response.json(); } catch {}
    
    safeRemove(loadingId);
    
    if (status === 403) {
      if (data?.error === 'INSUFFICIENT_TOKENS') addNoTokenCard();
      else addBotText(`⚠️ ${data?.error || "Forbidden"}`);
      return;
    }
    
    if (status === 429) {
      addBotText(`⚠️ ${TRANSLATIONS[currentLang].rateLimit}`);
      triggerCooldown(25);
      return;
    }
    
    if (!response.ok) {
      addBotText(`⚠️ Error (${status}): ${data?.error || data?.message || "Server error"}`);
      return;
    }
    
    if (data?.newBalance !== undefined) {
      document.getElementById('tokenBalance').textContent = data.newBalance;
    }
    
    const reply = (typeof data?.reply === "string") ? data.reply : (typeof data?.text === "string" ? data.text : "");
    const imgUrl = data?.imageUrl || data?.image_url || data?.url || "";
    
    if (reply && reply.trim() !== "") {
      chatHistory.push({ role: "user", content: String(text) });
      chatHistory.push({ role: "assistant", content: String(reply) });
      if (chatHistory.length > 24) chatHistory = chatHistory.slice(-24);
      addBotText(reply);
      return;
    }
    
    if (imgUrl) {
      addBotImage(imgUrl, data?.width, data?.height);
      return;
    }
    
    addBotText("⚠️ AI returned no content");
    
  } catch (error) {
    console.error("Frontend Error:", error);
    triggerCooldown(12);
    safeRemove(loadingId);
    addBotText("⚠️ Network / AI overload");
  }
}

function addBotText(text) {
    const div = document.createElement('div');
    div.className = 'message bot';

    // 1. تحويل النص من Markdown إلى HTML باستخدام marked
    // gfm: true يفعل الجداول والقوائم المحسنة
    // breaks: true يحول الضغط على Enter إلى سطر جديد
    const htmlContent = marked.parse(text, { gfm: true, breaks: true });

    div.innerHTML = `
        <div class="msg-bubble">
            <div class="markdown-body">${htmlContent}</div>
            <div class="msg-actions">
                <button class="copy-msg-btn" onclick="copyText(this, decodeURIComponent('${encodeURIComponent(text)}'))">
                    📑 نسخ الرد
                </button>
            </div>
        </div>
    `;

    // 2. البحث عن أكواد البرمجة وتغليفها في الصندوق الأسود (Code Box)
    const preBlocks = div.querySelectorAll('pre');
    
    preBlocks.forEach(pre => {
        // إذا كان الـ pre موجود بالفعل داخل wrapper نتخطاه (للحماية)
        if (pre.parentNode.classList.contains('code-wrapper')) return;

        // إنشاء الصندوق الخارجي
        const wrapper = document.createElement('div');
        wrapper.className = 'code-wrapper';

        // محاولة معرفة لغة الكود (اختياري)
        let langClass = pre.querySelector('code')?.className || '';
        let lang = langClass.replace('language-', '') || 'CODE';

        // إنشاء الهيدر (شريط العنوان وزر النسخ)
        const header = document.createElement('div');
        header.className = 'code-header';
        header.innerHTML = `
            <span class="code-lang">${lang.toUpperCase()}</span>
            <button class="copy-code-btn" onclick="copyCode(this)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copy Code
            </button>
        `;

        // إدخال الصندوق الجديد في الصفحة مكان الـ pre القديم
        pre.parentNode.insertBefore(wrapper, pre);
        
        // نقل الهيدر والـ pre داخل الصندوق
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
    });

    document.getElementById('chatContainer').appendChild(div);
    scrollToBottom();
}



function renderLoader(isChat) {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.id = 'loading-' + Date.now();

    if (isChat) {
        div.innerHTML = `
            <div class="chat-loading-bubble">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        `;
    } else {
        div.innerHTML = `
            <div class="image-loading-box">
                <div class="blur-wave"></div>
                <div class="loading-text">Generating...</div>
            </div>
        `;
    }

    document.getElementById('chatContainer').appendChild(div);
    scrollToBottom();
    return div.id;
}

function addMessage(content, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<div class="msg-bubble">${String(content || "")}</div>`;
    document.getElementById('chatContainer').appendChild(div);
    document.getElementById('emptyMsg').style.display = 'none';
    scrollToBottom();
}

function addNoTokenCard() {
    const t = TRANSLATIONS[currentLang];
    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = `
        <div class="msg-bubble">
            <div class="no-token-card">
                <div class="no-token-text">${t.noTokens}</div>
                <button class="buy-now-btn" onclick="openBuyModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="black"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
                    ${t.buyNow}
                </button>
            </div>
        </div>
    `;
    document.getElementById('chatContainer').appendChild(div);
    scrollToBottom();
}

function addBotImage(url, w, h) {
    const t = TRANSLATIONS[currentLang];
    const div = document.createElement('div');
    div.className = 'message bot';

    const ww = Number(w) || currentWidth;
    const hh = Number(h) || currentHeight;
    let aspectRatio = ww / hh;

    div.innerHTML = `
        <div class="msg-bubble">
            <div class="image-container" style="aspect-ratio: ${aspectRatio};">
                <img src="${url}" class="msg-image" onload="this.classList.add('loaded')">
            </div>
            <div class="download-bar">
                <button class="d-btn" onclick="forceDownload('${url}', this)">${t.download}</button>
            </div>
        </div>
    `;
    document.getElementById('chatContainer').appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    const c = document.getElementById('chatContainer');
    c.scrollTop = c.scrollHeight;
}

async function forceDownload(url, btn) {
    const downloadUrl = url + "?download=";

    try {
        await navigator.clipboard.writeText(downloadUrl);
        showInfoModal(downloadUrl);
    } catch (err) {
        const textArea = document.createElement("textarea");
        textArea.value = downloadUrl;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showInfoModal(downloadUrl);
        } catch (err) {
            console.error('Fallback copy failed', err);
            alert("Failed to copy link. Please manually open: " + downloadUrl);
        }
        document.body.removeChild(textArea);
    }
}

function showInfoModal(link) {
    document.getElementById('dlLinkBox').textContent = link;
    document.getElementById('downloadInfoModal').style.display = 'flex';
}

async function openGallery() {
    const t = TRANSLATIONS[currentLang];
    if (!piUser) { alert("Login Required"); return; }
    const modal = document.getElementById('galleryModal');
    const grid = document.getElementById('galleryGrid');
    modal.style.display = 'flex';
    grid.innerHTML = '<div style="color:white; text-align:center; grid-column: span 2;">Loading...</div>';
    try {
        const res = await fetch(`/api/get-gallery?username=${piUser.username}`);
        const images = await res.json();
        grid.innerHTML = '';
        if (!Array.isArray(images) || images.length === 0) {
            grid.innerHTML = `<div style="color:#777; padding:20px; grid-column: span 2; text-align:center;">${t.noImages}</div>`;
            return;
        }

        images.forEach(img => {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.innerHTML = `
                <img src="${img.url}" loading="lazy">
                <div class="gallery-actions">
                    <button class="g-btn g-down" onclick="forceDownload('${img.url}', this)">${t.download}</button>
                    <button class="g-btn g-del" onclick="deleteImage('${img.id}', this)">${t.delete}</button>
                </div>
            `;
            grid.appendChild(div);
        });
    } catch (e) {
        grid.innerHTML = `<div style="color:red; grid-column: span 2;">${t.error}</div>`;
    }
}

async function deleteImage(imageId, btn) {
    const t = TRANSLATIONS[currentLang];
    if (!confirm(t.confirmDel)) return;
    const parent = btn.closest('.gallery-item');
    parent.style.opacity = '0.5';
    try {
        const res = await fetch('/api/delete-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // ✅✅ هذا السطر هو الحل
    body: JSON.stringify({ id: imageId, username: piUser.username })
});
        if (res.ok) parent.remove();
        else { alert(t.error); parent.style.opacity = '1'; }
    } catch(e) { console.error(e); }
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#modelMenu') && !e.target.closest('.header-title-area')) {
        document.getElementById('modelMenu').style.display = 'none';
        document.getElementById('modelChevron').style.transform = 'rotate(0deg)';
    }
    if (!e.target.closest('#aspectMenu') && !e.target.closest('#aspectTriggerBtn')) {
        document.getElementById('aspectMenu').style.display = 'none';
    }
});

async function loadChatHistory() {
    if (!piUser) return;

    const loadingDiv = document.createElement('div');
    loadingDiv.innerHTML = '<div style="text-align:center; color:#555; font-size:12px; margin:10px;">Loading history...</div>';
    document.getElementById('chatContainer').appendChild(loadingDiv);

    try {
        const res = await fetch(`/api/get-chat-history?username=${piUser.username}`);
        const historyData = await res.json();

        document.getElementById('emptyMsg').style.display = 'none';
        loadingDiv.remove();

        const list = Array.isArray(historyData) ? historyData : [];

        list.forEach(item => {
            if (item?.prompt) {
                addMessage(item.prompt, 'user');
                chatHistory.push({ role: "user", content: String(item.prompt) });
            }

            if (item?.type === 'text' && item?.bot_response) {
                addBotText(item.bot_response);
                chatHistory.push({ role: "assistant", content: String(item.bot_response) });
            } else if (item?.image_url || item?.imageUrl) {
                addBotImage(item.image_url || item.imageUrl, item.width, item.height);
            }
        });

        // ✅ FIX: نظّف الهستوري
        chatHistory = normalizeMessages(chatHistory).slice(-24);

        scrollToBottom();

    } catch (e) {
        console.error("Error loading history:", e);
        loadingDiv.innerHTML = '<div style="text-align:center; color:red; font-size:12px;">Failed to load history</div>';
    }
}
function copyCode(btn) {
    // العثور على الكود داخل الصندوق
    const code = btn.closest('.code-wrapper').querySelector('code');
    if(code) {
        // نسخ النص
        navigator.clipboard.writeText(code.innerText).then(() => {
            // تغيير النص لـ "تم" مؤقتاً
            const old = btn.innerHTML; 
            btn.innerHTML = '<span>✅ تم!</span>';
            setTimeout(() => btn.innerHTML = old, 2000);
        });
    }
}
