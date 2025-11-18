// app.js - frontend logic for Mazen downloader (RTL)
// Written to work with the provided server endpoints: POST /api/get  { url, action }
(function(){
  const urlInput = document.getElementById('url');
  const pasteBtn = document.getElementById('pasteBtn');
  const getBtn = document.getElementById('getBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const status = document.getElementById('status');
  const result = document.getElementById('result');
  const directLink = document.getElementById('directLink');
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  function setStatus(text, muted){
    status.textContent = text;
    status.style.color = muted ? '' : '#dbeafe';
  }

  function showResult(url){
    result.classList.remove('hidden');
    directLink.href = url;
    directLink.textContent = url;
  }

  function hideResult(){
    result.classList.add('hidden');
    directLink.href = '';
    directLink.textContent = '';
  }

  pasteBtn.addEventListener('click', async ()=>{
    try {
      const txt = await navigator.clipboard.readText();
      if(txt) urlInput.value = txt;
      urlInput.focus();
      setStatus('تم اللصق من الحافظة', true);
    } catch(e){
      setStatus('خطأ في الوصول للحافظة — الصق يدويًا', true);
    }
  });

  function validate(u){
    if(!u) return false;
    try {
      const p = new URL(u);
      return p.protocol === 'http:' || p.protocol === 'https:';
    } catch(e){
      return false;
    }
  }

  getBtn.addEventListener('click', async ()=>{
    const u = urlInput.value.trim();
    if(!validate(u)) { setStatus('الرابط غير صالح — تأكد من البداية بـ http أو https', true); return; }
    hideResult();
    progressWrap.classList.add('hidden');
    setStatus('جاري استخراج الرابط المباشر...', false);
    try {
      const res = await fetch('/api/get', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url: u, action: 'get-url' })
      });
      const j = await res.json();
      if(!res.ok){
        setStatus('فشل الاستخراج: ' + (j.error || 'خطأ غير معروف'), true);
        return;
      }
      showResult(j.directUrl);
      setStatus('تم الحصول على الرابط المباشر — افتح الرابط أو نزله من خلال زر التنزيل.', true);
    } catch(err){
      setStatus('خطأ في الاتصال بالخادم', true);
      console.error(err);
    }
  });

  // download with streaming and progress
  downloadBtn.addEventListener('click', async ()=>{
    const u = urlInput.value.trim();
    if(!validate(u)) { setStatus('الرابط غير صالح — تأكد من البداية بـ http أو https', true); return; }
    hideResult();
    setStatus('جاري تجهيز الملف على الخادم...', false);
    progressWrap.classList.remove('hidden');
    updateProgress(0);

    try {
      // call server to prepare download
      const resp = await fetch('/api/get', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url: u, action: 'download' })
      });

      if(!resp.ok){
        const j = await resp.json().catch(()=>({error:'server error'}));
        setStatus('فشل التنزيل: ' + (j.error || 'خطأ غير معروف'), true);
        progressWrap.classList.add('hidden');
        return;
      }

      // stream the response to show progress
      const reader = resp.body.getReader();
      const contentLength = +resp.headers.get('Content-Length') || 0;
      let received = 0;
      const chunks = [];
      while(true){
        const {done, value} = await reader.read();
        if(done) break;
        chunks.push(value);
        received += value.length;
        if(contentLength) {
          updateProgress(Math.round((received / contentLength) * 100));
        } else {
          // fake progress if unknown
          const p = Math.min(95, Math.round((received / 1024 / 200) * 100));
          updateProgress(p);
        }
      }
      updateProgress(100);
      setStatus('تم التحميل من الخادم — جاري حفظ الملف...', true);

      // combine chunks and create blob
      let blob = new Blob(chunks);
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      // try to extract filename from headers
      const cd = resp.headers.get('Content-Disposition') || '';
      let filename = 'video';
      const m = cd.match(/filename="?([^"]+)"?/);
      if(m) filename = m[1];
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatus('تم الحفظ — تحقق من مجلد التنزيلات لديك.', true);
      setTimeout(()=>{ URL.revokeObjectURL(blobUrl); }, 30000);
      progressWrap.classList.add('hidden');
    } catch(err){
      console.error(err);
      setStatus('خطأ أثناء التنزيل: ' + (err.message || err), true);
      progressWrap.classList.add('hidden');
    }
  });

  function updateProgress(pct){
    const bar = document.querySelector('.progress-bar::before');
    // set width via style on element: use inline background size replacement
    const el = document.getElementById('progressBar');
    el.style.setProperty('--pct', pct + '%');
    // animate pseudo by setting width on before via CSS variable fallback:
    el.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02))';
    // update a fake inner fill by updating the real element's firstChild width using transform
    // instead, manipulate ::before by using el.style.setProperty won't affect pseudo, so we set innerHTML
    el.style.position = 'relative';
    let inner = el.querySelector('.inner-fill');
    if(!inner){
      inner = document.createElement('div');
      inner.className = 'inner-fill';
      inner.style.position = 'absolute';
      inner.style.left = '0';
      inner.style.top = '0';
      inner.style.bottom = '0';
      inner.style.width = '0%';
      inner.style.transition = 'width .18s ease';
      inner.style.background = 'linear-gradient(90deg, rgba(124,58,237,0.9), rgba(6,182,212,0.9))';
      el.insertBefore(inner, el.firstChild);
    }
    inner.style.width = pct + '%';
    progressText.textContent = pct + '%';
  }

  // small UX: support Enter to get direct link, Shift+Enter to download
  urlInput.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault(); getBtn.click();
    } else if(e.key === 'Enter' && e.shiftKey){
      e.preventDefault(); downloadBtn.click();
    }
  });

})();
