// This route is keyed by a runtime songId (IndexedDB-backed, task A3) that
// doesn't exist at build time, so it can't be crawled/prerendered like the
// rest of the static shell (root `+layout.ts` sets `prerender = true`
// globally). `adapter-static`'s `fallback: 'index.html'` serves the SPA
// shell for it at runtime instead — see docs/PLAN-v0.1.md "pure client-side"
// architecture decision.
export const prerender = false;
