// A per-song edit page can't be enumerated at build time (task B2) — this is
// a dynamic client-rendered route served through adapter-static's SPA
// fallback (see src/routes/+layout.ts for the app-wide prerender/ssr
// defaults this overrides).
export const prerender = false;
