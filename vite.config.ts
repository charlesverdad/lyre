import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

// SvelteKit's `paths.base` type is `'' | \`/${string}\`` — narrow the env var
// rather than casting, so a misconfigured `BASE_PATH` (missing leading
// slash) fails loudly instead of silently producing broken asset URLs.
function basePath(): '' | `/${string}` {
	const raw = process.env.BASE_PATH;
	if (!raw) return '';
	if (!raw.startsWith('/')) {
		throw new Error(`BASE_PATH must start with "/" (got ${JSON.stringify(raw)})`);
	}
	return raw as `/${string}`;
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Fallback must be 404.html: GitHub Pages has no SPA rewrites and only
			// serves 404.html for unknown paths, so dynamic routes (/song/<id>,
			// /edit/<id>) load the app shell through it. The prerendered root page
			// still provides index.html. Local `vite preview` also honors 404.html.
			adapter: adapter({ fallback: '404.html' }),
			// GitHub Pages serves the site from /lyre/ (see .github/workflows/deploy.yml,
			// task C1); empty ('') for local dev and the CI verify build, where the
			// site is served from the domain root. `BASE_PATH` must be unset or a
			// leading-slash path (SvelteKit's own `paths.base` constraint).
			paths: {
				base: basePath()
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
