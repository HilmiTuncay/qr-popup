// Sahte yoklama sitesi: QR 4 saniyede bir değişir (her seferinde yeni anahtar).
const http = require('http');
const QRCode = require('qrcode');
const crypto = require('crypto');

const PERIOD = 4000;
const key = () => Math.floor(Date.now() / PERIOD);
const payload = () => `https://yoklama.example.edu.tr/katil?ders=BIL101&k=${crypto.createHash('sha1').update(String(key())).digest('hex').slice(0, 16)}`;

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Akıllı Yoklama</title>
<style>body{font-family:sans-serif;margin:0;background:#eef2f7}header{background:#123;color:#fff;padding:14px 24px}
main{display:flex;gap:40px;padding:30px}aside{width:300px;background:#fff;padding:16px;border-radius:8px}
#card{background:#fff;padding:20px;border-radius:8px;text-align:center}</style></head><body>
<header>Akıllı Yoklama · BIL101 · Oturum açık</header>
<main><aside><h3>Ders bilgisi</h3><p>Katılan: <b id="n">0</b></p><p>Kod her birkaç saniyede yenilenir.</p></aside>
<div id="card"><h2>Yoklama kodu</h2><img id="qr" width="260" height="260"><p id="t"></p></div></main>
<script>
async function upd(){const r=await fetch('/qr');const j=await r.json();document.getElementById('qr').src=j.img;
document.getElementById('t').textContent='Kalan: '+Math.ceil(j.left/1000)+' sn';document.getElementById('n').textContent=Math.floor(Math.random()*90);}
upd();setInterval(upd,1000);
</script></body></html>`;

http.createServer(async (req, res) => {
  if (req.url === '/qr') {
    const img = await QRCode.toDataURL(payload(), { width: 260, margin: 1 });
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ img, left: PERIOD - (Date.now() % PERIOD) }));
  }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(page);
}).listen(Number(process.env.PORT || 8765), () => console.log('test site ready'));
