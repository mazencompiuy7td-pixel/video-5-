// server.js
const express = require('express');
const { execFile } = require('child_process');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(helmet());

// 🔥 السطر المهم: يخلّي Express يقدّم الملفات الثابتة (index.html, style.css, app.js, etc)
app.use(express.static(__dirname));

const limiter = rateLimit({ windowMs: 60*1000, max: 30 });
app.use(limiter);

app.post('/api/get', async (req, res) => {
  try {
    const url = req.body.url;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'invalid url' });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'invalid scheme' });

    if (req.body.action === 'get-url') {
      execFile('yt-dlp', ['--no-warnings', '--skip-download', '--get-url', '-f', 'best', url], (err, stdout, stderr) => {
        if (err) {
          console.error('yt-dlp error (get-url):', err, stderr);
          return res.status(500).json({ error: 'failed to extract' });
        }
        const directUrl = stdout.trim().split('\n').pop();
        return res.json({ directUrl });
      });
      return;
    }

    if (req.body.action === 'download') {
      const tmpDir = path.join(__dirname, 'tmp');
      const outPath = path.join(tmpDir, `video-${Date.now()}.%(ext)s`);
      fs.mkdirSync(tmpDir, { recursive: true });

      execFile('yt-dlp', ['-f', 'best', '-o', outPath, url], { maxBuffer: 1024*1024*50 }, (err, stdout, stderr) => {
        if (err) {
          console.error('yt-dlp error (download):', err, stderr);
          return res.status(500).json({ error: 'download failed' });
        }

        const files = fs.readdirSync(tmpDir)
          .map(f => ({ f, t: fs.statSync(path.join(tmpDir, f)).mtimeMs }))
          .sort((a,b)=>b.t - a.t);

        if (!files.length) return res.status(500).json({ error: 'no file produced' });

        const filePath = path.join(tmpDir, files[0].f);
        res.download(filePath, files[0].f, (err2) => {
          // احذف الملف بعد الارسال (حاول تتعامل مع الأخطاء لو احتجت)
          fs.unlink(filePath, ()=>{});
          if (err2) console.error('send error:', err2);
        });
      });
      return;
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch(e) {
    console.error('server error:', e);
    return res.status(500).json({ error: 'server error' });
  }
});

app.listen(3000, ()=>console.log('listening 3000'));
