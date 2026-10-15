// 기술 교육 OS 갤탭 앱 — 서비스 워커
// - 화면 파일(index.html)은 늘 인터넷에서 새로 받고, 안 되면 마지막으로 받아 둔 것을 연다.
// - React·Tailwind 같은 라이브러리는 한 번 받아 두고 재사용 → 앱이 빨리 열린다.
// - 급식·제미나이·유튜브·구글 시트 같은 데이터 요청은 절대 저장하지 않는다.
const CACHE = 'modong-os-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const LIB_HOSTS = ['cdn.tailwindcss.com', 'unpkg.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' || (url.origin === location.origin && /\.(html|webmanifest|png)$/.test(url.pathname))) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? './index.html' : req, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? './index.html' : req).then((r) => r || caches.match('./'))));
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; });
      return hit ? (net.catch(() => hit), hit) : net;
    })));
  }
});
