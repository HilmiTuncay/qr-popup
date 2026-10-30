// QR Yoklama Penceresi
// Yoklama sitesini arka planda açık tutar, sayfadaki QR kodu ekran görüntüsünden
// kendisi bulup okur ve her zaman üstte duran, slaytı durdurmayan bir pencerede gösterir.

const {
  app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut,
  screen, ipcMain, dialog, shell, safeStorage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const jsQR = require('jsqr');
const QRCode = require('qrcode');

const TEST = !!process.env.QRY_TEST; // otomatik test modu
// Test kendi ayar/oturum klasörünü kullanır; böylece açık olan gerçek uygulamayla çakışmaz
if (TEST) app.setPath('userData', path.join(require('os').tmpdir(), 'qr-yoklama-test'));
if (TEST && process.env.QRY_TEST_VERSION) app.setVersion(process.env.QRY_TEST_VERSION);
// Konsol çıktısı kapanmış bir boruya giderse (terminal kapandı) yazma hatası uygulamayı hata kutusuyla durdurmasın
for (const s of [process.stdout, process.stderr]) s.on('error', () => {});

// ---------------------------------------------------------------- ayarlar
const DEFAULTS = {
  url: 'https://yoklama.uludag.edu.tr',   // yoklama sayfasının adresi
  username: '',          // giriş sayfasına doldurulacak kullanıcı adı
  passwordEnc: null,     // şifre, Windows hesabına bağlı şifrelenmiş (safeStorage, base64)
  intervalMs: 1000,      // tarama sıklığı
  mode: 'redraw',        // 'redraw' = QR'ı yeniden çiz (net), 'crop' = sayfadaki görüntüyü kırp
  size: 320,             // köşe penceresinin kenarı (px)
  corner: 'top-right',   // top-left | top-right | bottom-left | bottom-right | custom
  customPos: null,       // {x,y} sürüklendiyse
  displayId: null,       // hangi ekran (null = otomatik: varsa ikinci ekran)
  autoHide: true,        // QR sayfadan kaybolunca pencereyi gizle
  autoHideSec: 20,
  margin: 24,
};
let cfg = { ...DEFAULTS };
let firstRun = false;      // ayar dosyası yoksa: ilk açılışta Ayarlar da açılır
const cfgFile = () => path.join(app.getPath('userData'), 'ayarlar.json');

function loadCfg() {
  try { cfg = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) }; } catch { cfg = { ...DEFAULTS }; firstRun = true; }
  if (TEST) Object.assign(cfg, { url: process.env.QRY_TEST_URL, intervalMs: 500, mode: process.env.QRY_TEST_MODE || 'redraw' });
  if (TEST) firstRun = false;
  if (TEST && process.env.QRY_TEST_USER) {
    cfg.username = process.env.QRY_TEST_USER;
    cfg.passwordEnc = safeStorage.encryptString(process.env.QRY_TEST_PASS || '').toString('base64');
  }
}
function saveCfg() {
  if (TEST) return;
  try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2)); } catch (e) { console.error(e); }
}

// ---------------------------------------------------------------- durum
let sourceWin = null, overlayWin = null, settingsWin = null, tray = null;
let quitting = false, busy = false, timer = null;
let big = false;           // "ortada büyük" modu
let userHidden = false;    // kullanıcı Ctrl+Alt+Q ile gizlediyse
const st = {
  lastData: null,          // son okunan QR içeriği (Buffer)
  lastLoc: null,           // son bulunduğu dikdörtgen (bitmap pikseli)
  lastSeen: 0,             // QR en son ne zaman görüldü
  nums: null,              // sayfadaki "42 sn" sayılarının son taraması
  cdIdx: null,             // bunlardan hangisi geri sayım (her saniye değişen)
};
let resizing = null;       // köşeden boyutlandırma sürerken {corner, b0}

// ---------------------------------------------------------------- pencereler
function createSourceWindow() {
  sourceWin = new BrowserWindow({
    width: 1280, height: 900, show: false,
    title: 'Yoklama sayfası — giriş yapıp QR ekranını açın, sonra bu pencereyi kapatın',
    autoHideMenuBar: true,
    webPreferences: {
      partition: 'persist:yoklama',     // oturum/çerezler kalıcı
      backgroundThrottling: false,      // gizliyken de sayfa çalışsın
      contextIsolation: true, sandbox: true,
    },
  });
  sourceWin.on('close', (e) => { if (!quitting) { e.preventDefault(); sourceWin.hide(); } });
  sourceWin.on('show', () => sourceWin.webContents.invalidate());   // gizliyken yakalanan sayfayı yeniden çiz
  sourceWin.webContents.on('did-navigate', wakeSource);             // gizliyken sayfa değişti (oturum düştü, tam yenileme)
  sourceWin.webContents.on('did-finish-load', fillLogin);
  sourceWin.webContents.on('did-navigate-in-page', fillLogin);      // tek sayfalık site (Angular) giriş ekranına döndüyse
  sourceWin.webContents.setWindowOpenHandler(({ url }) => {
    sourceWin.loadURL(url); return { action: 'deny' };   // açılır pencereleri aynı pencerede aç
  });
  if (cfg.url) {
    sourceWin.loadURL(cfg.url);
    // Açılışta sayfayı göster: giriş yapılıp QR başlatılınca kapatılır, uygulama tepside sürer
    if (!TEST) sourceWin.once('ready-to-show', showSource);
  }
}

// Bir kez gösterilip gizlenen pencerede yeni sayfa açılınca Chromium onu çizmiyor ve capturePage hiç dönmüyor.
// Görünmez (opaklık 0), odak almayan kısa bir gösterim çizimi yeniden başlatır.
let wakeTimer = null;
function wakeSource() {
  if (!sourceWin || (sourceWin.isVisible() && !wakeTimer)) return;
  clearTimeout(wakeTimer);
  sourceWin.setOpacity(0); sourceWin.showInactive();
  wakeTimer = setTimeout(() => { wakeTimer = null; sourceWin.hide(); sourceWin.setOpacity(1); }, 300);
}
function showSource() {
  clearTimeout(wakeTimer); wakeTimer = null;
  sourceWin.setOpacity(1); sourceWin.show(); sourceWin.focus();
}

// ---------------------------------------------------------------- kayıtlı giriş
// Giriş sayfasında kullanıcı adı ve şifre kutularını doldurur; "Giriş"e kullanıcı kendisi basar.
// Yalnızca ayarlardaki yoklama sitesinin sayfasına doldurulur.
function savedPassword() {
  try { return cfg.passwordEnc ? safeStorage.decryptString(Buffer.from(cfg.passwordEnc, 'base64')) : ''; } catch { return ''; }
}
function sameSite(a, b) { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } }
function fillLogin() {
  if (!cfg.username && !cfg.passwordEnc) return;
  if (!sameSite(sourceWin.webContents.getURL(), cfg.url)) return;
  const js = `(${fillLoginForm})(${JSON.stringify(cfg.username)}, ${JSON.stringify(savedPassword())})`;
  sourceWin.webContents.executeJavaScript(js, true).catch(() => {});
}
// Sayfada çalışır. Form sonradan çizilebileceği için 15 sn boyunca şifre kutusunu arar;
// dolu kutuya dokunmaz (kullanıcı yazıyorsa bozmaz).
function fillLoginForm(user, pass) {
  const deadline = Date.now() + 15000;
  const usable = (el) => el.offsetParent !== null && !el.disabled && !el.readOnly;
  const set = (el, v) => {
    if (!v || el.value) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);   // Angular/React değişikliği görsün
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const tryFill = () => {
    const pw = [...document.querySelectorAll('input[type=password]')].find(usable);
    if (!pw) { if (Date.now() < deadline) setTimeout(tryFill, 500); return; }
    // kullanıcı adı: şifre kutusundan önce gelen son metin kutusu
    const before = [...(pw.form || document).querySelectorAll('input')]
      .filter((el) => usable(el) && /^(text|email|tel|number)$/.test(el.type) && (el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (before.length) set(before[before.length - 1], user);
    set(pw, pass);
  };
  tryFill();
}

function createOverlay() {
  overlayWin = new BrowserWindow({
    width: cfg.size, height: cfg.size + 22,
    frame: false, resizable: false, movable: true,
    alwaysOnTop: true, skipTaskbar: true, focusable: false,  // tıklanınca slayt odağı kaybetmez
    hasShadow: true, show: false, backgroundColor: '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); // macOS tam ekran Space'leri
  overlayWin.loadFile(path.join(__dirname, 'overlay.html'));
  overlayWin.on('moved', () => {
    if (big || resizing) return;
    snapToEdges();
    const [x, y] = overlayWin.getPosition();
    cfg.corner = 'custom'; cfg.customPos = { x, y }; cfg.displayId = screen.getDisplayNearestPoint({ x, y }).id; saveCfg();
    rebuildMenu();
  });
  placeOverlay();
}

function targetDisplay() {
  const all = screen.getAllDisplays();
  const byId = all.find((d) => d.id === cfg.displayId);
  if (byId) return byId;
  const primary = screen.getPrimaryDisplay();
  return all.find((d) => d.id !== primary.id) || primary; // varsa projektör (ikinci ekran)
}

function placeOverlay() {
  if (!overlayWin) return;
  const d = targetDisplay(); const wa = d.workArea; const b = d.bounds;
  if (big) {
    const s = Math.round(Math.min(b.width, b.height) * 0.8);
    overlayWin.setBounds({ x: b.x + Math.round((b.width - s) / 2), y: b.y + Math.round((b.height - s - 22) / 2), width: s, height: s + 22 });
    return;
  }
  const { x, y } = cfg.corner === 'custom' && cfg.customPos ? cfg.customPos : cornerPos(b, cfg.size);
  overlayWin.setBounds({ x, y, width: cfg.size, height: cfg.size + 22 });
}

// Kenara tam oturduysa ya da biraz taştıysa kenara yapıştır (köşede iki kenar birden).
// Yaklaşırken çekmez; böylece köşeye doğru sürüklemek zorlaşmaz.
const SNAP = 8;
function snapToEdges() {
  const b = overlayWin.getBounds(), a = screen.getDisplayMatching(b).bounds;
  let { x, y } = b;
  if (x < a.x + SNAP) x = a.x;
  else if (x + b.width > a.x + a.width - SNAP) x = a.x + a.width - b.width;
  if (y < a.y + SNAP) y = a.y;
  else if (y + b.height > a.y + a.height - SNAP) y = a.y + a.height - b.height;
  if (x !== b.x || y !== b.y) overlayWin.setPosition(x, y);
}

// Tam ekran slaytta görev çubuğu yoktur; ekranın tamamına (bounds) göre yerleştir
function cornerPos(area, size) {
  const m = cfg.margin;
  return {
    x: cfg.corner.endsWith('left') ? area.x + m : area.x + area.width - size - m,
    y: cfg.corner.startsWith('top') ? area.y + m : area.y + area.height - size - 22 - m,
  };
}

function createSettings() {
  if (settingsWin) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 520, height: 720, resizable: false, autoHideMenuBar: true, title: 'QR Yoklama — Ayarlar',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------------------------------------------------------------- QR tarama
function bitmapRGBA(img) {
  const sf = (img.getScaleFactors && img.getScaleFactors()[0]) || 1;
  const { width, height } = img.getSize(sf);
  const raw = img.toBitmap({ scaleFactor: sf });
  // toBitmap çoğu platformda BGRA verir; jsQR RGBA bekler -> R ile B'yi değiştir
  const px = new Uint8ClampedArray(raw.length);
  for (let i = 0; i < raw.length; i += 4) { px[i] = raw[i + 2]; px[i + 1] = raw[i + 1]; px[i + 2] = raw[i]; px[i + 3] = 255; }
  const w = width, h = raw.length / 4 / width;
  return { px, w, h: Math.floor(h), sf };
}

function cropRGBA(src, sw, x0, y0, cw, ch) {
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(src.subarray(((y0 + y) * sw + x0) * 4, ((y0 + y) * sw + x0 + cw) * 4), y * cw * 4);
  return out;
}

function decode(bmp) {
  const { px, w, h } = bmp;
  // Önce son bulunduğu yerin çevresine bak (hızlı)
  if (st.lastLoc) {
    const L = st.lastLoc, pad = Math.round(Math.max(L.w, L.h) * 0.6);
    const x0 = Math.max(0, L.x - pad), y0 = Math.max(0, L.y - pad);
    const cw = Math.min(w - x0, L.w + 2 * pad), ch = Math.min(h - y0, L.h + 2 * pad);
    if (cw > 20 && ch > 20) {
      const r = jsQR(cropRGBA(px, w, x0, y0, cw, ch), cw, ch, { inversionAttempts: 'attemptBoth' });
      if (r) return withRect(r, x0, y0);
    }
  }
  const r = jsQR(px, w, h, { inversionAttempts: 'attemptBoth' });
  return r ? withRect(r, 0, 0) : null;
}

// Sayfadaki "42 sn" / "42 saniye" sayılarından her taramada değişeni geri sayım kabul et
async function readCountdown() {
  let nums;
  try {
    nums = await sourceWin.webContents.executeJavaScript(
      String.raw`Array.from((document.body && document.body.innerText || '').matchAll(/(\d{1,4})\s*(?:sn|saniye)(?![a-zçğıöşü])/gi), (m) => +m[1])`, true);
  } catch { return null; }
  const prev = st.nums; st.nums = nums;
  if (st.cdIdx != null && (!prev || nums.length !== prev.length)) st.cdIdx = null;   // sayfa değişti
  if (st.cdIdx == null && prev && nums.length === prev.length) {
    const i = nums.findIndex((n, k) => n !== prev[k]);
    if (i >= 0) st.cdIdx = i;
  }
  return st.cdIdx != null ? nums[st.cdIdx] : null;
}

function withRect(r, ox, oy) {
  const L = r.location;
  const xs = [L.topLeftCorner.x, L.topRightCorner.x, L.bottomLeftCorner.x, L.bottomRightCorner.x];
  const ys = [L.topLeftCorner.y, L.topRightCorner.y, L.bottomLeftCorner.y, L.bottomRightCorner.y];
  const x = Math.floor(Math.min(...xs)) + ox, y = Math.floor(Math.min(...ys)) + oy;
  return { data: Buffer.from(r.binaryData), rect: { x, y, w: Math.ceil(Math.max(...xs)) + ox - x, h: Math.ceil(Math.max(...ys)) + oy - y } };
}

async function tick() {
  if (busy || !sourceWin || !cfg.url) return;
  busy = true;
  try {
    // stayHidden: pencere gizliyken de sayfa çizilmeye devam etsin (görünürken verilirse pencere boş kalır)
    // Zaman aşımı: yakalama takılırsa döngü kilitlenmesin, QR "görünmüyor" sayılsın
    const img = await Promise.race([
      sourceWin.webContents.capturePage(undefined, { stayHidden: !sourceWin.isVisible(), stayAwake: true }),
      new Promise((r) => setTimeout(r, 3000, null)),
    ]);
    if (!img) wakeSource();
    const now = Date.now();
    let found = null;
    if (img && !img.isEmpty()) {
      const bmp = bitmapRGBA(img);
      found = decode(bmp);
      if (found) {
        st.lastLoc = found.rect; st.lastSeen = now;
        const changed = !st.lastData || !st.lastData.equals(found.data);
        if (changed) {
          st.lastData = found.data;
          if (TEST) console.log('QRY_EVENT change', found.data.toString());
        }
        if (cfg.mode === 'crop') {
          const R = found.rect, pad = Math.round(Math.max(R.w, R.h) * 0.08);
          const rect = { x: Math.round((R.x - pad) / bmp.sf), y: Math.round((R.y - pad) / bmp.sf), width: Math.round((R.w + 2 * pad) / bmp.sf), height: Math.round((R.h + 2 * pad) / bmp.sf) };
          send('qr', { kind: 'img', src: img.crop(rect).toDataURL() });
        } else if (changed) {
          const svg = await QRCode.toString([{ data: found.data, mode: 'byte' }], { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
          send('qr', { kind: 'svg', svg });
        }
      }
    }
    const left = found ? await readCountdown() : null;
    updateVisibility(now, !!found);
    send('status', { found: !!found, sinceSeen: st.lastSeen ? now - st.lastSeen : null, left, big });
  } catch (e) {
    console.error('Tarama hatası:', e.message);
  } finally { busy = false; }
}

function updateVisibility(now, found) {
  if (!overlayWin) return;
  const absentFor = st.lastSeen ? now - st.lastSeen : Infinity;
  const shouldShow = !userHidden && (found || !cfg.autoHide || absentFor < cfg.autoHideSec * 1000) && (st.lastSeen || !cfg.autoHide);
  if (shouldShow && !overlayWin.isVisible()) { placeOverlay(); overlayWin.showInactive(); }
  else if (!shouldShow && overlayWin.isVisible()) overlayWin.hide();
  if (overlayWin.isVisible()) { overlayWin.setAlwaysOnTop(true, 'screen-saver'); overlayWin.moveTop(); } // PowerPoint öne geçse bile geri al
  if (tray) tray.setToolTip(found ? 'QR Yoklama — QR görünüyor' : st.lastSeen ? `QR Yoklama — QR ${Math.round(absentFor / 1000)} sn'dir görünmüyor` : 'QR Yoklama — QR bekleniyor');
}

function send(ch, data) { if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send(ch, data); }

function restartTimer() { clearInterval(timer); timer = setInterval(tick, Math.max(250, cfg.intervalMs)); }

// ---------------------------------------------------------------- menü ve kısayollar
function toggleOverlay() { userHidden = !userHidden; if (userHidden) overlayWin.hide(); else { placeOverlay(); overlayWin.showInactive(); } rebuildMenu(); }
// QR penceresindeki küçük düğmeler: tam ekran (ortada büyük) ve simge durumu (tepsiye gizle)
let hideHintShown = false;
ipcMain.on('overlay:big', toggleBig);
ipcMain.on('overlay:hide', () => {
  if (userHidden) return;
  toggleOverlay();
  if (!hideHintShown && tray && process.platform === 'win32') {
    hideHintShown = true;
    tray.displayBalloon({ title: 'QR gizlendi', content: 'Geri getirmek için Ctrl+Alt+Q ya da tepsideki QR simgesi → "QR penceresini göster".' });
  }
});
function toggleBig() { big = !big; placeOverlay(); if (!userHidden && st.lastSeen) overlayWin.showInactive(); rebuildMenu(); }
function resize(delta) { cfg.size = Math.max(160, Math.min(1200, cfg.size + delta)); big = false; saveCfg(); placeOverlay(); }

// Köşeden tutup boyutlandırma: QR kare kalır, tutulan köşenin karşısındaki köşe yerinde durur
const MIN_SIZE = 160;
ipcMain.on('resize:start', (_e, corner) => { resizing = { corner, b0: overlayWin.getBounds() }; });
ipcMain.on('resize:move', (_e, dx, dy) => {
  if (!resizing) return;
  const { corner, b0 } = resizing;
  const sx = corner.endsWith('left') ? -1 : 1, sy = corner.startsWith('top') ? -1 : 1;
  const d = Math.abs(dx) > Math.abs(dy) ? sx * dx : sy * dy;     // hangi yöne daha çok çekildiyse
  const area = screen.getDisplayMatching(b0).bounds;
  const s = Math.round(Math.max(MIN_SIZE, Math.min(b0.width + d, Math.min(area.width, area.height - 22))));
  overlayWin.setBounds({
    x: sx < 0 ? b0.x + b0.width - s : b0.x,
    y: sy < 0 ? b0.y + b0.height - s - 22 : b0.y,
    width: s, height: s + 22,
  });
});
ipcMain.on('resize:end', () => {
  if (!resizing) return;
  resizing = null;
  if (big) return;                       // "ortada büyük" geçicidir, kaydedilmez
  snapToEdges();
  const b = overlayWin.getBounds();
  cfg.size = b.width;
  // Seçili köşeye yapışık kalmıyorsa (karşı köşeden çekildi) serbest konuma geç
  const p = cornerPos(screen.getDisplayMatching(b).bounds, b.width);
  if (cfg.corner !== 'custom' && (p.x !== b.x || p.y !== b.y)) cfg.corner = 'custom';
  if (cfg.corner === 'custom') { cfg.customPos = { x: b.x, y: b.y }; cfg.displayId = screen.getDisplayMatching(b).id; }
  saveCfg(); rebuildMenu();
});
function setCorner(c) { cfg.corner = c; cfg.customPos = null; big = false; saveCfg(); placeOverlay(); rebuildMenu(); }

function rebuildMenu() {
  if (!tray) return;
  const corners = [['top-left', 'Sol üst'], ['top-right', 'Sağ üst'], ['bottom-left', 'Sol alt'], ['bottom-right', 'Sağ alt']];
  const displays = screen.getAllDisplays();
  const cur = targetDisplay();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Yoklama sayfasını göster (giriş / QR başlatma)', click: showSource },
    { label: 'Sayfayı yenile', click: () => sourceWin.webContents.reload() },
    { type: 'separator' },
    { label: 'QR penceresini göster', type: 'checkbox', checked: !userHidden, accelerator: 'Ctrl+Alt+Q', click: toggleOverlay },
    { label: 'Ortada büyük göster', type: 'checkbox', checked: big, accelerator: 'Ctrl+Alt+B', click: toggleBig },
    { label: 'Büyüt', accelerator: 'Ctrl+Alt+Up', click: () => resize(40) },
    { label: 'Küçült', accelerator: 'Ctrl+Alt+Down', click: () => resize(-40) },
    { label: 'Konum', submenu: corners.map(([v, l]) => ({ label: l, type: 'radio', checked: cfg.corner === v, click: () => setCorner(v) })) },
    { label: 'Ekran', submenu: displays.map((d, i) => ({ label: `Ekran ${i + 1} (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? ' — ana' : ''}`, type: 'radio', checked: d.id === cur.id, click: () => { cfg.displayId = d.id; if (cfg.corner === 'custom') cfg.corner = 'top-right'; saveCfg(); placeOverlay(); rebuildMenu(); } })) },
    { label: 'Görünüm', submenu: [
      { label: 'Yeniden çiz (en net, önerilen)', type: 'radio', checked: cfg.mode === 'redraw', click: () => { cfg.mode = 'redraw'; st.lastData = null; saveCfg(); } },
      { label: 'Sayfadaki görüntüyü kırp', type: 'radio', checked: cfg.mode === 'crop', click: () => { cfg.mode = 'crop'; saveCfg(); } },
    ] },
    { type: 'separator' },
    { label: 'Ayarlar…', click: createSettings },
    { label: 'QR Yoklama · Hilmi Tunçay', enabled: false },
    { label: 'Çıkış', click: () => { quitting = true; app.quit(); } },
  ]));
}

function registerShortcuts() {
  const map = { 'Ctrl+Alt+Q': toggleOverlay, 'Ctrl+Alt+B': toggleBig, 'Ctrl+Alt+Up': () => resize(40), 'Ctrl+Alt+Down': () => resize(-40) };
  for (const [k, fn] of Object.entries(map)) if (!globalShortcut.register(k, fn)) console.warn('Kısayol alınamadı:', k);
}

// ---------------------------------------------------------------- IPC
// Şifre pencerelere hiç gönderilmez; yalnızca kayıtlı olup olmadığı bildirilir
const publicCfg = () => { const { passwordEnc, ...c } = cfg; return { ...c, hasPassword: !!passwordEnc }; };
ipcMain.handle('cfg:get', publicCfg);
ipcMain.handle('cfg:set', (_e, { password, forgetPassword, passwordEnc, hasPassword, ...patch }) => {
  if (forgetPassword) patch.passwordEnc = null;
  else if (password) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Bu bilgisayarda şifre güvenli saklanamıyor');
    patch.passwordEnc = safeStorage.encryptString(password).toString('base64');
  }
  const urlChanged = patch.url !== undefined && patch.url !== cfg.url;
  cfg = { ...cfg, ...patch }; saveCfg();
  if (urlChanged) { st.lastLoc = null; st.lastData = null; sourceWin.loadURL(cfg.url); showSource(); }
  restartTimer(); placeOverlay(); rebuildMenu();
  return publicCfg();
});
ipcMain.handle('source:show', showSource);

// ---------------------------------------------------------------- başlangıç
// Aynı anda ikinci kopya açılırsa: açılan daha yeni sürümse eskisi kapanır ve yenisi devralır;
// aynı ya da eski sürümse açık olan öne gelir, yeni açılan kapanır (ders ortasında QR ekranı kaybolmasın).
const runningFile = () => path.join(app.getPath('userData'), 'calisan.json');
const newer = (a, b) => {   // a, b'den yeni mi (1.10.0 > 1.9.0)
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
async function takeLock() {
  const me = { version: app.getVersion() };
  if (app.requestSingleInstanceLock(me)) return true;
  let running = null;
  try { running = JSON.parse(fs.readFileSync(runningFile(), 'utf8')).version; } catch {}
  if (running && !newer(me.version, running)) return false;
  for (let i = 0; i < 40; i++) {   // eski kopyanın kapanmasını bekle (en çok 10 sn)
    await new Promise((r) => setTimeout(r, 250));
    if (app.requestSingleInstanceLock(me)) return true;
  }
  return false;
}
app.on('second-instance', (_e, _argv, _cwd, other) => {
  if (other && newer(other.version, app.getVersion())) { quitting = true; app.quit(); return; }
  if (!userHidden && st.lastSeen && overlayWin) overlayWin.showInactive();
  createSettings();
});
app.on('window-all-closed', (e) => e.preventDefault()); // tepside çalışmaya devam

app.whenReady().then(async () => {
  if (!(await takeLock())) { app.quit(); return; }
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(runningFile(), JSON.stringify({ version: app.getVersion(), pid: process.pid })); } catch {}
  loadCfg();
  if (process.platform === 'darwin' && app.dock) app.dock.hide(); // macOS: tam ekran slaytın üstünde kalabilmek için
  createSourceWindow();
  createOverlay();
  const icon = nativeImage.createFromDataURL(await QRCode.toDataURL('QR', { width: 32, margin: 1 }));
  tray = new Tray(icon);
  tray.setToolTip('QR Yoklama · Hilmi Tunçay');
  tray.on('click', () => tray.popUpContextMenu());
  rebuildMenu();
  registerShortcuts();
  screen.on('display-added', () => { placeOverlay(); rebuildMenu(); });
  screen.on('display-removed', () => { placeOverlay(); rebuildMenu(); });
  if (firstRun || !cfg.url) createSettings();
  restartTimer();
  if (TEST) runTestHooks();
});
app.on('will-quit', () => globalShortcut.unregisterAll());

// ---------------------------------------------------------------- test kancası
function runTestHooks() {
  const out = process.env.QRY_TEST_OUT || '.';
  let n = 0;
  if (cfg.username) setTimeout(async () => {    // kayıtlı giriş: kutular doldu mu
    const v = await sourceWin.webContents.executeJavaScript(
      "[...document.querySelectorAll('input')].map((i) => i.type + '=' + (i.type === 'password' ? i.value.length + ' karakter' : i.value)).join(' ')");
    console.log('QRY_EVENT login', sourceWin.webContents.getURL(), v);
  }, 4000);
  if (process.env.QRY_TEST_SETTINGS) {   // Ayarlar penceresi gerçekten çiziliyor mu
    createSettings();
    setTimeout(async () => {
      const file = path.join(out, 'settings.png');
      fs.writeFileSync(file, (await settingsWin.webContents.capturePage()).toPNG());
      const v = await settingsWin.webContents.executeJavaScript("document.getElementById('url').value + ' | kullanıcı=' + document.getElementById('user').value + ' | şifre: ' + document.getElementById('pass').placeholder");
      console.log('QRY_EVENT settings', file, v);
    }, 2500);
  }
  if (process.env.QRY_TEST_CLICK) {   // QR penceresindeki düğmelere gerçek fare tıklaması
    const click = async (id) => {
      const r = await overlayWin.webContents.executeJavaScript(`(() => { const b = document.getElementById('${id}').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
      for (const type of ['mouseDown', 'mouseUp']) overlayWin.webContents.sendInputEvent({ type, x: Math.round(r[0]), y: Math.round(r[1]), button: 'left', clickCount: 1 });
    };
    setTimeout(async () => { await click('big'); setTimeout(() => console.log('QRY_EVENT click big ->', overlayWin.getBounds().width + 'px', 'big=' + big), 500); }, 5000);
    setTimeout(async () => { await click('big'); await new Promise((r) => setTimeout(r, 1500)); await click('min'); setTimeout(() => console.log('QRY_EVENT click min -> visible=' + overlayWin.isVisible()), 500); }, 8000);
  }
  setInterval(async () => {
    if (quitting || overlayWin.isDestroyed()) return;
    if (!overlayWin.isVisible()) { console.log('QRY_EVENT overlay hidden'); return; }
    const img = await overlayWin.webContents.capturePage();
    const file = path.join(out, `overlay-${++n}.png`);
    fs.writeFileSync(file, img.toPNG());
    const bmp = bitmapRGBA(img);
    const r = jsQR(bmp.px, bmp.w, bmp.h);
    const bar = await overlayWin.webContents.executeJavaScript("document.getElementById('bar').textContent");
    console.log('QRY_EVENT overlay', file, 'aot=' + overlayWin.isAlwaysOnTop(), 'decoded=' + (r ? r.data : 'NONE'), 'bar=' + JSON.stringify(bar));
  }, 3000);
  setTimeout(() => { quitting = true; app.quit(); }, Number(process.env.QRY_TEST_MS || 20000));
}
