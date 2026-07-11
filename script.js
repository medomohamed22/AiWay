'use strict';

const state = { lang: 'ar', token: null, models: [], packages: [], piPrice: null, paymentsEnabled: false,
  model: null, ratio: { id:'square', label:'1:1', width:1024, height:1024 }, history: [], busy:false };
const ratios = [
  { id:'square',label:'1:1',width:1024,height:1024 }, { id:'portrait',label:'9:16',width:768,height:1344 },
  { id:'landscape',label:'16:9',width:1344,height:768 }, { id:'wide',label:'21:9',width:1536,height:640 }
];
const copy = {
  ar:{login:'تسجيل دخول Pi',desc:'تحدث وأنشئ صورًا باستخدام أشهر نماذج الذكاء الاصطناعي',features:'يدعم الموقع',soon:'قريبًا',gallery:'المعرض',galleryTitle:'معرضي',buy:'شراء Tokens',placeholder:'اكتب رسالتك…',empty:'اختر نموذجًا واكتب ما تتخيله',delete:'حذف',download:'فتح/تحميل',noImages:'لا توجد ملفات محفوظة',confirm:'هل تريد حذف هذا الملف؟'},
  en:{login:'Pi Login',desc:'Chat and create images with popular AI models',features:'Supported features',soon:'Soon',gallery:'Gallery',galleryTitle:'My gallery',buy:'Buy tokens',placeholder:'Type your message…',empty:'Choose a model and start imagining',delete:'Delete',download:'Open / download',noImages:'No saved media',confirm:'Delete this item?'}
};
const $ = (id) => document.getElementById(id);

function toast(message) { const el=$('toast'); el.textContent=message; el.classList.remove('hidden'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.add('hidden'),3500); }
function setModal(id, open) { $(id).setAttribute('aria-hidden', String(!open)); }
function authHeaders(json=false) { return { ...(json?{'Content-Type':'application/json'}:{}), Authorization:`Bearer ${state.token}` }; }
async function api(url, options={}) {
  const response=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(data.error||`HTTP_${response.status}`),{status:response.status});
  return data;
}
function safeHttpUrl(value) { try { const u=new URL(String(value),location.origin); return ['https:','http:'].includes(u.protocol)?u.href:null; } catch{return null;} }
function element(tag, className, text) { const el=document.createElement(tag); if(className)el.className=className;if(text!==undefined)el.textContent=text;return el; }

async function loadConfig() {
  const data=await api('/api/get-app-config');
  state.models=Array.isArray(data.models)?data.models.filter(m=>m&&typeof m.id==='string'&&['text','image','video'].includes(m.type)):[];
  state.packages=Array.isArray(data.packages)?data.packages:[]; state.piPrice=Number(data.piUsdPrice)||null;
  state.paymentsEnabled=data.paymentsEnabled===true; state.model=state.models[0]||null; renderModels(); renderPackages(); updateModel();
}
function renderModels() {
  const menu=$('modelMenu'); menu.replaceChildren();
  for(const provider of [...new Set(state.models.map(m=>m.provider))]) {
    menu.append(element('div','menu-category-title',provider));
    for(const model of state.models.filter(m=>m.provider===provider)) {
      const item=element('button',`menu-option${state.model?.id===model.id?' active':''}`); item.type='button';
      const info=element('span'); info.append(element('strong','',model.name),element('small','',` ${model.type.toUpperCase()}`));
      item.append(info,element('span','model-tag',`${model.cost} T`)); item.addEventListener('click',()=>{state.model=model;updateModel();renderModels();menu.classList.remove('open');});menu.append(item);
    }
  }
}
function updateModel() { $('headerModelName').textContent=state.model?`${state.model.name} · ${state.model.cost} T`:'لا توجد نماذج'; $('aspectTriggerBtn').classList.toggle('hidden',state.model?.type==='text'); }
function renderRatios(){const menu=$('aspectMenu');menu.replaceChildren();ratios.forEach(r=>{const b=element('button',`menu-option${state.ratio.id===r.id?' active':''}`,r.label);b.type='button';b.addEventListener('click',()=>{state.ratio=r;$('currentAspectLabel').textContent=r.label;menu.classList.remove('open');renderRatios();});menu.append(b);});}
function renderPackages(){const grid=$('buyGrid');grid.replaceChildren();if(!state.paymentsEnabled){grid.append(element('p','status','الشراء متوقف حتى يحدد الخادم سعر Pi.'));return;}state.packages.forEach(pkg=>{if(!pkg?.id||!Number.isFinite(Number(pkg.usd))||!Number.isFinite(Number(pkg.tokens)))return;const amount=(Number(pkg.usd)/state.piPrice).toFixed(4);const b=element('button','buy-card');b.type='button';b.append(element('strong','',`${pkg.tokens} Tokens`),element('span','buy-cost',`${amount} π · $${pkg.usd}`));b.addEventListener('click',()=>buy(pkg,amount));grid.append(b);});}

function piError(error) {
  if (typeof error === 'string') return error;
  return String(error?.message || error?.error || error?.code || 'PI_AUTH_FAILED').slice(0, 180);
}
async function login(){
  if(!window.Pi)return toast('Pi SDK غير متاح؛ افتح الموقع داخل Pi Browser');
  $('loginStatus').textContent='جاري التحقق…';
  let auth;
  try {
    auth=await window.Pi.authenticate(['username','payments'],resumePayment);
    if(!auth?.accessToken)throw new Error('Pi لم يُرجع Access Token');
  } catch(error) {
    console.error('Pi authentication failed:',error);
    const message=`فشل توثيق Pi: ${piError(error)}`;
    $('loginStatus').textContent=message; toast(message); return;
  }
  state.token=auth.accessToken;
  $('landingPage').classList.add('hidden');
  try { await Promise.all([balance(),history()]); }
  catch(error) { console.error('Account bootstrap failed:',error); toast(`تم دخول Pi لكن فشل تحميل الحساب: ${piError(error)}`); }
  finally { $('loginStatus').textContent=''; }
}
async function balance(){const data=await api('/api/get-balance',{headers:authHeaders()});$('tokenBalance').textContent=String(data.balance??0);}
async function resumePayment(payment){if(!payment?.identifier||!state.token)return;toast('يوجد دفع غير مكتمل؛ أكمله من محفظة Pi.');}
async function buy(pkg,amount){if(!state.token)return toast('سجّل الدخول أولًا');try{await Pi.createPayment({amount:Number(amount),memo:`${pkg.tokens} Tokens - AIWay`,metadata:{packageId:pkg.id,type:'tokens'}},{onReadyForServerApproval:async paymentId=>{await api('/api/approve',{method:'POST',headers:authHeaders(true),body:JSON.stringify({paymentId})});},onReadyForServerCompletion:async(paymentId,txid)=>{const result=await api('/api/complete',{method:'POST',headers:authHeaders(true),body:JSON.stringify({paymentId,txid})});$('tokenBalance').textContent=String(result.newBalance);setModal('buyModal',false);toast('تمت إضافة الرصيد');},onCancel:()=>toast('تم إلغاء الدفع'),onError:()=>toast('فشل الدفع')});}catch(e){console.error(e);toast(e.message);}}

function addUser(text){const row=element('div','message user'),bubble=element('div','msg-bubble',text);row.append(bubble);$('chatContainer').append(row);scroll();}
function addBot(text){const row=element('div','message bot'),bubble=element('div','msg-bubble'),body=element('div','markdown-body');if(window.marked&&window.DOMPurify){const dirty=marked.parse(String(text),{gfm:true,breaks:true});body.innerHTML=DOMPurify.sanitize(dirty,{USE_PROFILES:{html:true}});}else body.textContent=text;const copyBtn=element('button','copy-msg-btn','نسخ');copyBtn.type='button';copyBtn.addEventListener('click',()=>navigator.clipboard.writeText(String(text)).then(()=>toast('تم النسخ')).catch(()=>{}));bubble.append(body,copyBtn);row.append(bubble);$('chatContainer').append(row);scroll();}
function addMedia(url,kind,width,height){const safe=safeHttpUrl(url);if(!safe)return;const row=element('div','message bot'),bubble=element('div','msg-bubble'),media=document.createElement(kind==='video'?'video':'img');media.className='msg-media';media.src=safe;if(kind==='video')media.controls=true;const open=element('a','d-btn',copy[state.lang].download);open.href=safe;open.target='_blank';open.rel='noopener noreferrer';bubble.append(media,open);row.append(bubble);$('chatContainer').append(row);scroll();}
function scroll(){$('emptyMsg').classList.add('hidden');$('chatContainer').scrollTop=$('chatContainer').scrollHeight;}
async function send(event){event.preventDefault();if(state.busy||!state.token||!state.model)return toast('سجّل الدخول واختر نموذجًا');const input=$('promptInput'),prompt=input.value.trim();if(!prompt)return;state.busy=true;$('sendBtn').disabled=true;input.value='';addUser(prompt);try{const messages=state.model.type==='text'?[...state.history,{role:'user',content:prompt}].slice(-20):undefined;const result=await api('/api/generate-and-save',{method:'POST',headers:authHeaders(true),body:JSON.stringify({prompt,model:state.model.id,width:state.ratio.width,height:state.ratio.height,messages})});if(result.reply){addBot(result.reply);state.history.push({role:'user',content:prompt},{role:'assistant',content:result.reply});state.history=state.history.slice(-20);}else if(result.imageUrl)addMedia(result.imageUrl,'image',result.width,result.height);else if(result.videoUrl)addMedia(result.videoUrl,'video');$('tokenBalance').textContent=String(result.newBalance);}catch(e){toast(e.message==='INSUFFICIENT_TOKENS'?'الرصيد غير كافٍ':e.message);addBot('تعذر تنفيذ الطلب بأمان. لم يتم احتساب التكلفة عند فشل المزود.');}finally{state.busy=false;$('sendBtn').disabled=false;}}
async function history(){const rows=await api('/api/get-chat-history',{headers:authHeaders()});if(!Array.isArray(rows))return;rows.forEach(row=>{if(row.prompt)addUser(String(row.prompt));if(row.bot_response)addBot(String(row.bot_response));state.history.push({role:'user',content:String(row.prompt||'')},{role:'assistant',content:String(row.bot_response||'')});});state.history=state.history.filter(m=>m.content).slice(-20);}
async function gallery(){if(!state.token)return toast('سجّل الدخول أولًا');setModal('galleryModal',true);const grid=$('galleryGrid');grid.replaceChildren(element('p','status','جاري التحميل…'));try{const rows=await api('/api/get-gallery',{headers:authHeaders()});grid.replaceChildren();if(!rows.length)return grid.append(element('p','status',copy[state.lang].noImages));rows.forEach(row=>{const safe=safeHttpUrl(row.url);if(!safe)return;const card=element('div','gallery-item'),media=document.createElement(row.kind==='video'?'video':'img');media.src=safe;if(row.kind==='video')media.controls=true;const actions=element('div','gallery-actions'),open=element('a','g-btn g-down',copy[state.lang].download),del=element('button','g-btn g-del',copy[state.lang].delete);open.href=safe;open.target='_blank';open.rel='noopener noreferrer';del.type='button';del.addEventListener('click',async()=>{if(!confirm(copy[state.lang].confirm))return;try{await api('/api/delete-image',{method:'POST',headers:authHeaders(true),body:JSON.stringify({id:row.id})});card.remove();}catch(e){toast(e.message);}});actions.append(open,del);card.append(media,actions);grid.append(card);});}catch(e){grid.replaceChildren(element('p','status',e.message));}}
function language(){state.lang=state.lang==='ar'?'en':'ar';document.documentElement.lang=state.lang;document.documentElement.dir=state.lang==='ar'?'rtl':'ltr';const t=copy[state.lang];$('langBtn').textContent=state.lang==='ar'?'EN':'AR';$('landingLangBtn').textContent=$('langBtn').textContent;$('txtLogin').textContent=t.login;$('txtLandingDesc').textContent=t.desc;$('txtFeaturesTitle').textContent=t.features;$('txtSoonVideo').textContent=t.soon;$('txtGallery').textContent=t.gallery;$('txtGalleryTitle').textContent=t.galleryTitle;$('txtBuyTitle').textContent=t.buy;$('promptInput').placeholder=t.placeholder;$('emptyMsg').textContent=t.empty;}

document.addEventListener('DOMContentLoaded',async()=>{try{Pi.init({version:'2.0',sandbox:false});}catch{}$('loginBtn').addEventListener('click',login);$('langBtn').addEventListener('click',language);$('landingLangBtn').addEventListener('click',language);$('promptForm').addEventListener('submit',send);$('galleryBtn').addEventListener('click',gallery);$('buyBtn').addEventListener('click',()=>setModal('buyModal',true));$('modelTrigger').addEventListener('click',()=>{const open=$('modelMenu').classList.toggle('open');$('modelTrigger').setAttribute('aria-expanded',String(open));});$('aspectTriggerBtn').addEventListener('click',()=>$('aspectMenu').classList.toggle('open'));document.querySelectorAll('.modal-close').forEach(b=>b.addEventListener('click',()=>setModal(b.closest('.modal-overlay').id,false)));document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)setModal(m.id,false);}));renderRatios();language();language();try{await loadConfig();}catch(e){toast('تعذر تحميل إعدادات الخادم');$('loginBtn').disabled=true;}});
