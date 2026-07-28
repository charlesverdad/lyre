import { migrateFromIndexedDbOnce } from '$lib/db/migrateFromIndexedDb';

// Lyre is a fully client-side PWA (adapter-static, no server). Prerender
// everything to a static SPA shell and disable SSR — see docs/PLAN-v0.1.md
// and AGENTS.md for the "pure client-side" architecture decision.
export const prerender = true;
export const ssr = false;

// Root layout `load` runs (and is awaited) before any route's own load/mount
// — the one choke point that guarantees the one-shot IndexedDB→localStorage
// migration (task E1, docs/PLAN-v0.3.md §E1) completes before any screen
// reads library data, without every screen needing to know migration exists.
export async function load() {
	await migrateFromIndexedDbOnce();
	return {};
}
