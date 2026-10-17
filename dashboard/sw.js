/*
  📲 모동중 기술 교육 OS — 갤탭 앱(PWA) 서비스 워커
  - 갤탭 앱 모드(https 주소)에서만 등록된다. 교무실 PC(127.0.0.1)에서는 등록하지 않는다.
  - 화면 파일(index.html): 인터넷이 되면 항상 새 것(4초 안에 안 오면 저장본) → 업데이트가 바로 반영되고, 인터넷이 없어도 열린다.
  - 같은 폴더 파일(tablet.css, 아이콘 등): 저장본을 먼저 보여 주고 뒤에서 새 것으로 바꿔 둔다.
  - CDN 라이브러리(React, Babel, Tailwind, 글꼴 등): 저장본을 먼저 쓰고 뒤에서 새로 받아 둔다(따로 보관).
  - 구글 시트 동기화·NEIS·제미나이·유튜브·구글 로그인 같은 '데이터' 요청과 POST는 절대 건드리지 않는다.
  - 고친 뒤에는 아래 VERSION 글자를 바꿔야 갤탭에 "새 버전이 있어요"가 뜬다.
*/
const VERSION = 'v2-2026-10-17';
const SHELL_CACHE = 'modong-shell-' + VERSION;
const CDN_CACHE = 'modong-cdn-' + VERSION;
const NAV_TIMEOUT_MS = 4000;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './tablet.css',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

// index.html 이 실제로 쓰는 CDN 주소 (mode 는 페이지가 요청하는 방식과 같아야 한다)
const CDN_WARM = [
  { url: 'https://cdn.tailwindcss.com', mode: 'no-cors' },
  { url: 'https://unpkg.com/react@18/umd/react.production.min.js', mode: 'cors' },        // crossorigin="" 로 불러옴
  { url: 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js', mode: 'cors' }, // crossorigin="" 로 불러옴
  { url: 'https://unpkg.com/@babel/standalone@7/babel.min.js', mode: 'no-cors' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', mode: 'no-cors' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2', mode: 'cors' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2', mode: 'cors' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2', mode: 'cors' },
  { url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&family=Oxanium:wght@400;500;600;700&display=swap', mode: 'no-cors' },
  { url: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', mode: 'no-cors' }
];

const CDN_HOSTS = new Set([
  'unpkg.com',
  'cdn.tailwindcss.com',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
]);

// 절대 가로채거나 저장하지 않는 곳 (동기화·중계·NEIS·구글 API·로그인·유튜브)
const NEVER_HOSTS = [
  /(^|\.)script\.google\.com$/,
  /(^|\.)googleusercontent\.com$/,
  /(^|\.)open\.neis\.go\.kr$/,
  /^www\.googleapis\.com$/,
  /^generativelanguage\.googleapis\.com$/,
  /(^|\.)googleapis\.com$/,            // fonts.googleapis.com 은 위 CDN_HOSTS 에서 먼저 처리
  /^accounts\.google\.com$/,
  /(^|\.)youtube\.com$/,
  /(^|\.)youtube-nocookie\.com$/,
  /(^|\.)ytimg\.com$/,
  /(^|\.)noembed\.com$/
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // 앱 껍데기: 하나씩 담아서, 한 개(예: 아직 없는 tablet.css)가 실패해도 설치는 계속된다
    await Promise.all(SHELL.map(async (u) => {
      try {
        const res = await fetch(new Request(u, { cache: 'reload' }));
        if (res.ok) await shell.put(u, res);
      } catch (e) { /* 다음에 다시 받는다 */ }
    }));
    // CDN 미리 받아 두기 (처음 한 번 인터넷이 될 때). 실패해도 설치는 계속된다.
    const cdn = await caches.open(CDN_CACHE);
    await Promise.all(CDN_WARM.map(async (item) => {
      try {
        const req = new Request(item.url, { mode: item.mode, credentials: 'omit' });
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') await cdn.put(item.url, res);
      } catch (e) { /* 무시 */ }
    }));
  })());
  // 새 버전은 화면의 "지금 바꾸기"를 눌렀을 때만 바뀐다 (첫 설치는 바로 켜진다)
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, CDN_CACHE]);
    const names = await caches.keys();
    // 예전 CDN 저장본은 새 저장본에 없는 것만 옮겨 담아 오프라인이 끊기지 않게 한 뒤 지운다
    const newCdn = await caches.open(CDN_CACHE);
    for (const name of names) {
      if (keep.has(name)) continue;
      if (name.startsWith('modong-cdn-')) {
        try {
          const old = await caches.open(name);
          for (const req of await old.keys()) {
            if (!(await newCdn.match(req))) {
              const r = await old.match(req);
              if (r) await newCdn.put(req, r);
            }
          }
        } catch (e) {}
      }
      if (name.startsWith('modong-')) await caches.delete(name);
    }
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && (event.data === 'SKIP_WAITING' || event.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

function scopeUrl(path) { return new URL(path, self.registration.scope).href; }

function isNever(url) {
  return NEVER_HOSTS.some((re) => re.test(url.hostname));
}

// 화면(index.html): 네트워크 먼저, 4초 넘으면 저장본
async function handleNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  const shellKey = scopeUrl('./');
  const network = (async () => {
    const pre = event.preloadResponse ? await event.preloadResponse.catch(() => null) : null;
    const res = pre || await fetch(event.request);
    const navPath = new URL(event.request.url).pathname;
    const scopePath = new URL(self.registration.scope).pathname;
    const isShell = navPath === scopePath || navPath === scopePath + 'index.html';
    if (isShell && res && res.ok && res.type === 'basic' && !res.redirected) {
      await cache.put(shellKey, res.clone());
    }
    return res;
  })();
  event.waitUntil(network.then(() => {}, () => {}));   // 시간 초과로 저장본을 보여 줘도 새 것은 받아 둔다

  const cachedShell = async () =>
    (await cache.match(event.request, { ignoreSearch: true })) ||
    (await cache.match(shellKey)) ||
    (await cache.match(scopeUrl('./index.html')));

  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(resolve, NAV_TIMEOUT_MS, 'timeout'); });
  try {
    const first = await Promise.race([network, timeout]);
    if (first !== 'timeout') { clearTimeout(timer); return first; }
    const cached = await cachedShell();
    return cached || await network;   // 저장본이 없으면 끝까지 기다린다
  } catch (e) {
    clearTimeout(timer);
    const cached = await cachedShell();
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#04111c;color:#d8f6ff;font-family:sans-serif;text-align:center">' +
      '<div><div style="font-size:48px">📡</div><p style="font-size:20px;font-weight:700">인터넷에 연결되어 있지 않아요</p>' +
      '<p style="color:#8fb7c7">처음 한 번은 인터넷이 필요해요. 와이파이를 켠 뒤 다시 열어 주세요.</p>' +
      '<button onclick="location.reload()" style="margin-top:12px;padding:12px 22px;border-radius:12px;border:1.5px solid #4fe3ff;background:#4fe3ff;color:#04111c;font-weight:800;font-size:16px">다시 시도</button></div></body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// 저장본 먼저 + 뒤에서 새로 받기
async function staleWhileRevalidate(event, cacheName) {
  const req = event.request;
  const cache = await caches.open(cacheName);
  let cached = await cache.match(req);
  // CORS 로 요청했는데 저장본이 opaque 면 쓸 수 없다 → 버리고 네트워크
  if (cached && cached.type === 'opaque' && req.mode === 'cors') cached = undefined;
  const network = fetch(req).then(async (res) => {
    if (res && (res.ok || res.type === 'opaque')) {
      try { await cache.put(req, res.clone()); } catch (e) {}
    }
    return res;
  });
  if (cached) {
    event.waitUntil(network.then(() => {}, () => {}));
    return cached;
  }
  return network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                     // POST 등은 그대로 통과
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (req.headers.has('range')) return;                 // 영상·소리 부분 요청은 건드리지 않음

  if (url.origin === self.location.origin) {
    if (/\/api\/|\/wallpaper/.test(url.pathname)) return;   // 데이터 요청은 저장하지 않음
    const scopePath = new URL(self.registration.scope).pathname;
    if (!url.pathname.startsWith(scopePath)) return;
    if (req.mode === 'navigate') { event.respondWith(handleNavigation(event)); return; }
    event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
    return;
  }

  if (CDN_HOSTS.has(url.hostname)) { event.respondWith(staleWhileRevalidate(event, CDN_CACHE)); return; }
  if (isNever(url)) return;
  // 그 밖의 다른 사이트 요청도 손대지 않는다
});
