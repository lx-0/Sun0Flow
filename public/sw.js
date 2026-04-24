const CACHE_NAME = "sunoflow-v3";
const STATIC_CACHE = "sunoflow-static-v1";
const API_CACHE = "sunoflow-api-v1";
const AUDIO_CACHE = "sunoflow-audio-v1";
const OFFLINE_URL = "/offline.html";
const QUEUE_STORE = "sunoflow-offline-queue";

const PRECACHE_URLS = [OFFLINE_URL];

// Max cached audio files (LRU eviction)
const MAX_AUDIO_ENTRIES = 20;
// Max cached static assets (JS/CSS bundles, fonts, icons)
const MAX_STATIC_ENTRIES = 100;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use individual add() calls so a single failed URL doesn't abort the
      // entire install.  addAll() rejects if ANY request fails (e.g. offline.html
      // returns an error during a deploy), which blocks activation.
      Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keepCaches = [CACHE_NAME, STATIC_CACHE, API_CACHE, AUDIO_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !keepCaches.includes(key))
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isStaticAsset(url) {
  const path = new URL(url).pathname;
  // Next.js content-hashed bundles and image optimizer output
  return (
    path.startsWith("/_next/static/") ||
    path.startsWith("/_next/image/")
  );
}

function isPublicStaticAsset(url) {
  const path = new URL(url).pathname;
  // Public directory assets: fonts, icons, manifest, etc.
  return (
    path.startsWith("/icons/") ||
    path.startsWith("/fonts/") ||
    path === "/manifest.json"
  );
}

function isApiRequest(url) {
  const path = new URL(url).pathname;
  return path.startsWith("/api/");
}

function isCacheableApiRequest(url) {
  const path = new URL(url).pathname;
  // Cache song library metadata and dashboard stats
  return (
    path === "/api/songs" ||
    path.startsWith("/api/songs?") ||
    path === "/api/songs/favorites" ||
    path === "/api/dashboard/stats" ||
    path === "/api/notifications"
  );
}

function isAudioUrl(url) {
  const u = new URL(url);
  return (
    u.hostname.includes("sunoapi.org") ||
    u.hostname.includes("removeai.ai") ||
    u.hostname.includes("redpandaai.co")
  );
}

function isProxiedAudioRequest(url) {
  return new URL(url).pathname.startsWith("/api/audio/");
}

function isGenerateRequest(request) {
  return (
    request.method === "POST" &&
    new URL(request.url).pathname === "/api/generate"
  );
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    // Evict oldest entries (first added)
    const toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

// ─── IndexedDB queue for offline generation requests ─────────────────────────

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_STORE, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("queue", {
        keyPath: "id",
        autoIncrement: true,
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueRequest(request) {
  const body = await request.clone().text();
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    tx.objectStore("queue").add({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      timestamp: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushQueue() {
  const db = await openQueueDB();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readonly");
    const req = tx.objectStore("queue").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const item of items) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      // Remove from queue on success
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").delete(item.id);
      await new Promise((resolve) => {
        tx.oncomplete = resolve;
      });
    } catch {
      // Still offline or request failed — stop flushing
      break;
    }
  }

  // Notify clients that queue was flushed
  const clients = await self.clients.matchAll();
  clients.forEach((client) =>
    client.postMessage({ type: "QUEUE_FLUSHED", remaining: items.length })
  );
}

// ─── Fetch handler ───────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // 0. Let Next.js RSC payload requests pass through to the network untouched.
  if (
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-State-Tree")
  ) {
    return;
  }

  // 1. Queue generation requests when offline
  if (isGenerateRequest(request)) {
    event.respondWith(
      fetch(request.clone()).catch(async () => {
        await enqueueRequest(request);
        return new Response(
          JSON.stringify({
            queued: true,
            message:
              "You are offline. Your generation request has been queued and will be submitted when you reconnect.",
          }),
          {
            status: 202,
            headers: { "Content-Type": "application/json" },
          }
        );
      })
    );
    return;
  }

  // 2a. Proxied audio requests: cache-first for explicitly-saved offline songs,
  //     network-with-cache-fallback otherwise (enables offline playback).
  if (isProxiedAudioRequest(url) && request.method === "GET") {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;

        // Not in cache — fetch from network (will succeed when online)
        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            // Store for subsequent requests (the explicit Save Offline action
            // also stores here, so this acts as a warm-up on first play).
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return new Response("Audio not available offline", { status: 503 });
        }
      })
    );
    return;
  }

  // 2. Cache API responses (stale-while-revalidate for song metadata)
  if (isApiRequest(url) && request.method === "GET") {
    if (isCacheableApiRequest(url)) {
      event.respondWith(
        caches.open(API_CACHE).then(async (cache) => {
          const cachedResponse = await cache.match(request);

          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        })
      );
      return;
    }
    // Other API requests: network-only
    return;
  }

  // 3. Cache audio files (cache-first for playback)
  if (isAudioUrl(url) && request.method === "GET") {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;

        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          cache.put(request, networkResponse.clone());
          trimCache(AUDIO_CACHE, MAX_AUDIO_ENTRIES);
        }
        return networkResponse;
      })
    );
    return;
  }

  // 4. Static Next.js assets and public static files: cache-first (app shell).
  // Next.js content-hashes all /_next/static/ filenames so a cache hit is
  // always valid; no stale-content risk. Caching these enables previously-
  // visited pages to render offline using assets already in the SW cache.
  if (request.method === "GET" && (isStaticAsset(url) || isPublicStaticAsset(url))) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;

        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
            trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES);
          }
          return networkResponse;
        } catch {
          return new Response("Asset unavailable offline", { status: 503 });
        }
      })
    );
    return;
  }

  // 5. Navigation requests: network-first with offline fallback.
  // Use redirect:"follow" (default) but detect server-side redirects via
  // response.redirected so we can surface them as a real browser navigation
  // (updating the address bar). Without this, the SW silently serves the
  // redirect target's HTML under the original URL, breaking auth redirects.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.redirected && response.url) {
          // Server redirected — tell the browser to navigate to the final URL
          // so the address bar updates correctly (e.g., auth → /login).
          return Response.redirect(response.url, 302);
        }
        return response;
      }).catch(() =>
        caches.match(OFFLINE_URL).then((cached) =>
          cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/html" } })
        )
      )
    );
    return;
  }
});

// ─── Background sync: flush queued requests when back online ─────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === "flush-generate-queue") {
    event.waitUntil(flushQueue());
  }
});

// ─── Push notifications ──────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "SunoFlow", body: event.data.text(), url: "/" };
  }

  const title = payload.title ?? "SunoFlow";
  const options = {
    body: payload.body ?? "",
    icon: payload.icon ?? "/icon-192x192.png",
    badge: payload.badge ?? "/icon-192x192.png",
    data: { url: payload.url ?? "/" },
    tag: payload.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus an existing tab if open
        for (const client of clients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        // Open a new tab
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// ─── Message handler ─────────────────────────────────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FLUSH_QUEUE") {
    flushQueue();
  }
});
