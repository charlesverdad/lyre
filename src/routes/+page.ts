import { redirect } from '@sveltejs/kit';

// Client-side landing redirect — this is a pure SPA (see +layout.ts:
// prerender/ssr), so there's no server to issue a real HTTP redirect.
export function load() {
	redirect(307, '/library');
}
