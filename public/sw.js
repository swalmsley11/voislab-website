// VoisLab Service Worker for Offline Capability and Caching
const CACHE_NAME = 'voislab-v1';
const STATIC_CACHE_NAME = 'voislab-static-v1';
const AUDIO_CACHE_NAME = 'voislab-audio-v1';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/vite.svg'
];

// Audio files cache configuration
const AUDIO_CACHE_MAX_SIZE = 50; // Maximum number of audio files to cache
const AUDIO_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static files');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('Service Worker: Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Error caching static files:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== STATIC_CACHE_NAME && 
                cacheName !== AUDIO_CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated successfully');
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests with caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests with appropriate caching strategies
  if (request.method === 'GET') {
    // Audio files - cache with expiration
    if (isAudioRequest(request)) {
      event.respondWith(handleAudioRequest(request));
    }
    // Static assets - cache first
    else if (isStaticAsset(request)) {
      event.respondWith(handleStaticAssetRequest(request));
    }
    // API requests - network first with fallback
    else if (isAPIRequest(request)) {
      event.respondWith(handleAPIRequest(request));
    }
    // HTML pages - network first with cache fallback
    else if (isHTMLRequest(request)) {
      event.respondWith(handleHTMLRequest(request));
    }
    // Default - network first
    else {
      event.respondWith(handleDefaultRequest(request));
    }
  }
});

// Helper functions for request type detection
function isAudioRequest(request) {
  return request.url.includes('.mp3') || 
         request.url.includes('.wav') || 
         request.url.includes('.ogg') ||
         request.url.includes('audio') ||
         request.headers.get('accept')?.includes('audio');
}

function isStaticAsset(request) {
  return request.url.includes('.js') ||
         request.url.includes('.css') ||
         request.url.includes('.png') ||
         request.url.includes('.jpg') ||
         request.url.includes('.jpeg') ||
         request.url.includes('.svg') ||
         request.url.includes('.ico') ||
         request.url.includes('.woff') ||
         request.url.includes('.woff2');
}

function isAPIRequest(request) {
  return request.url.includes('/api/') ||
         request.url.includes('amazonaws.com') ||
         request.url.includes('dynamodb') ||
         request.url.includes('s3');
}

function isHTMLRequest(request) {
  return request.headers.get('accept')?.includes('text/html');
}

// Audio request handler - cache with size and age limits
async function handleAudioRequest(request) {
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('Service Worker: Serving audio from cache:', request.url);
      return cachedResponse;
    }
    
    console.log('Service Worker: Fetching audio from network:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Clone response for caching
      const responseToCache = networkResponse.clone();
      
      // Manage cache size and add new audio file
      await manageAudioCache(cache, request, responseToCache);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Audio request failed:', error);
    return new Response('Audio unavailable offline', { status: 503 });
  }
}

// Static asset handler - cache first strategy
async function handleStaticAssetRequest(request) {
  try {
    const cache = await caches.open(STATIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('Service Worker: Static asset request failed:', error);
    return caches.match('/offline.html') || new Response('Resource unavailable offline');
  }
}

// API request handler - network first with cache fallback
async function handleAPIRequest(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache for API request');
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response(JSON.stringify({ error: 'Service unavailable offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// HTML request handler - network first with cache fallback
async function handleHTMLRequest(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache for HTML request');
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fallback to cached index.html for SPA routing
    return caches.match('/index.html') || new Response('Page unavailable offline');
  }
}

// Default request handler
async function handleDefaultRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('Resource unavailable offline');
  }
}

// Manage audio cache size and expiration
async function manageAudioCache(cache, request, response) {
  try {
    // Get all cached audio files
    const keys = await cache.keys();
    const audioKeys = keys.filter(key => isAudioRequest(key));
    
    // Remove expired entries
    const now = Date.now();
    for (const key of audioKeys) {
      const cachedResponse = await cache.match(key);
      if (cachedResponse) {
        const cachedDate = cachedResponse.headers.get('sw-cached-date');
        if (cachedDate && (now - parseInt(cachedDate)) > AUDIO_CACHE_MAX_AGE) {
          console.log('Service Worker: Removing expired audio cache:', key.url);
          await cache.delete(key);
        }
      }
    }
    
    // Check cache size limit
    const remainingKeys = await cache.keys();
    const remainingAudioKeys = remainingKeys.filter(key => isAudioRequest(key));
    
    if (remainingAudioKeys.length >= AUDIO_CACHE_MAX_SIZE) {
      // Remove oldest entry (simple FIFO strategy)
      const oldestKey = remainingAudioKeys[0];
      console.log('Service Worker: Cache full, removing oldest audio:', oldestKey.url);
      await cache.delete(oldestKey);
    }
    
    // Add timestamp header and cache the new response
    const responseWithTimestamp = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...response.headers,
        'sw-cached-date': now.toString()
      }
    });
    
    await cache.put(request, responseWithTimestamp);
    console.log('Service Worker: Cached new audio file:', request.url);
  } catch (error) {
    console.error('Service Worker: Error managing audio cache:', error);
  }
}

// Background sync for failed requests (if supported)
if ('sync' in self.registration) {
  self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync') {
      console.log('Service Worker: Background sync triggered');
      event.waitUntil(handleBackgroundSync());
    }
  });
}

async function handleBackgroundSync() {
  // Implement background sync logic for failed requests
  console.log('Service Worker: Performing background sync...');
}

// Message handling for cache management
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(clearAllCaches());
  }
});

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('Service Worker: All caches cleared');
}