// A per-collection screen can't be enumerated at build time (task E3) — this
// is a dynamic client-rendered route served through adapter-static's SPA
// fallback (see src/routes/+layout.ts for the app-wide prerender/ssr
// defaults this overrides), same as the song and edit routes.
export const prerender = false;
