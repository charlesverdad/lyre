import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// Client-side landing redirect — this is a pure SPA (see +layout.ts:
// prerender/ssr), so there's no server to issue a real HTTP redirect.
// resolve() keeps the redirect base-aware: under GitHub Pages the app lives
// at /lyre/, and a bare '/library' would escape the site entirely.
export function load() {
	redirect(307, resolve('/(app)/library'));
}
