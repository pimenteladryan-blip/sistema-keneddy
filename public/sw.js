'use strict';

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAjCY6nydEIs_v9vv8mDczk6ODRilPPy7c',
  authDomain: 'svge-14ec7.firebaseapp.com',
  projectId: 'svge-14ec7',
  storageBucket: 'svge-14ec7.firebasestorage.app',
  messagingSenderId: '427867210389',
  appId: '1:427867210389:web:fff75f3f888e853f71519c',
  measurementId: 'G-W78G9MW4VL'
});
const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title || 'SGVE';
  const options = { body: payload.notification?.body || 'Você recebeu uma nova atualização.', icon: '/icon.svg', badge: '/icon.svg', data: { url: payload.fcmOptions?.link || '/' } };
  return self.registration.showNotification(title, options);
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    for (const client of clients) if (client.url === target && 'focus' in client) return client.focus();
    return self.clients.openWindow(target);
  }));
});

const CACHE_NAME = 'sgve-static-v3';
const STATIC_ASSETS = [
  '/css/styles.css',
  '/css/sgve-modern.css',
  '/js/app.js',
  '/manifest.webmanifest',
  '/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('sgve-static-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (!STATIC_ASSETS.includes(url.pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});
