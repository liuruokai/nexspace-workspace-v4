/**
 * NexSpace Service Worker
 * ----------------------------------------------------------------
 * - 预缓存关键资源（HTML / CSS / JS / icons）
 * - 运行时缓存: stale-while-revalidate
 * - API 请求: 网络优先，失败回退到缓存
 * - 离线时显示 offline.html
 */

const CACHE_VERSION = 'nexspace-v1';
const PRE_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/styles.css',
  '/js/utils.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/auth.js',
  '/js/sync.js',
  '/js/modules.js',
  '/js/app.js',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/* 监听 install */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRE_CACHE)).then(() => self.skipWaiting())
  );
});

/* 激活时清理旧缓存 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* 通用 fetch 拦截 */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只处理 GET，同源
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // API 请求：网络优先，失败回退到缓存（不支持离线返回旧数据）
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          return resp;
        })
        .catch(() => caches.match(req).then((r) => r || new Response(
          JSON.stringify({ code: 503, message: '当前离线且无缓存' }),
          { headers: { 'Content-Type': 'application/json' } }
        )))
    );
    return;
  }

  // 静态资源：stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

/* 监听消息（用于跳过等待） */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
