// 単語リングのサービスワーカー：電波がなくても開けるように、ページとアイコン・文字（フォント）を端末にとっておく。
// ページは毎回まずネットから取りに行くので、GitHub に新しい index.html を上げれば、次に開いたときから新しい版になる。
const CACHE = "tango-ring-v1";
const CORE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const keep = (req, res) => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; };

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 同じサイトのもの（ページ・アイコン）：ネットから。つながらないときは、とっておいた版
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => res.ok ? keep(req, res) : res)
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(m => m || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
    return;
  }
  // フォント（Google Fonts）：とっておいた版を先に使う（めったに変わらないため）
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(res => keep(req, res))));
  }
});
