/**
 * Native SvelteKit service worker (task C1, mvp-spec.md "Fully offline after
 * grab" / F3 "Works fully offline"). Everything is client-side already
 * (`adapter-static`, `ssr = false`) — this just makes the second-and-later
 * visit work with no network at all:
 *
 *   - install: cache every build asset + prerendered page (`$service-worker`
 *     gives us the exact list SvelteKit generated), plus the SPA fallback
 *     shell adapter-static serves for routes it can't prerender (`song/[id]`,
 *     `edit/[songId]` — runtime IndexedDB ids, see those routes' `+page.ts`).
 *   - fetch: network-first for navigations (fresh HTML when online, cached
 *     shell when not — a dynamic route falls back to the cached SPA shell
 *     itself, since the client-side router takes it from there), cache-first
 *     for hashed `_app/` build assets (content-hashed, safe to never
 *     revalidate), cache-first-with-background-fill for everything else.
 *   - activate: drop any cache from a previous deploy (`version`-keyed name).
 */

/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { base, build, files, prerendered, version } from '$service-worker';

declare let self: ServiceWorkerGlobalScope;

const CACHE_NAME = `lyre-cache-${version}`;

// `build`, `files`, and `prerendered` are all already `base`-prefixed, full
// URL strings by the time `$service-worker` hands them to us (see
// `@sveltejs/kit`'s `build_service_worker.js`) — no extra prefixing needed.
const ASSETS = [...build, ...files, ...prerendered];

// adapter-static's `fallback: 'index.html'` (vite.config.ts) is what
// actually gets served, at runtime, for non-prerendered routes — cache it
// explicitly so a cold offline load of e.g. `/song/<id>` still resolves to
// the SPA shell instead of a network error.
const SHELL_URL = `${base}/index.html`;

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);
			await cache.addAll(ASSETS);
			// Best-effort: dev/preview without a built fallback file shouldn't
			// fail the whole install.
			try {
				await cache.add(SHELL_URL);
			} catch {
				// no-op — e.g. `vite dev`, where there's no static fallback to fetch.
			}
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
			await self.clients.claim();
		})()
	);
});

async function cacheFirst(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE_NAME);
	const cached = await cache.match(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (response.ok) await cache.put(request, response.clone());
	return response;
}

async function networkFirstNavigation(request: Request): Promise<Response> {
	const cache = await caches.open(CACHE_NAME);
	try {
		const response = await fetch(request);
		if (response.ok) await cache.put(request, response.clone());
		return response;
	} catch {
		return (await cache.match(request)) ?? (await cache.match(SHELL_URL)) ?? Response.error();
	}
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirstNavigation(request));
		return;
	}

	// Hashed, content-addressed build assets — never change under a given
	// filename, so cache-first with no revalidation is correct.
	if (url.pathname.startsWith(`${base}/_app/`)) {
		event.respondWith(cacheFirst(request));
		return;
	}

	// Everything else (manifest, icons, static/): cache-first, filling the
	// cache on first fetch so it's available offline afterwards.
	event.respondWith(cacheFirst(request));
});
