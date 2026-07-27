import { defineConfig, devices } from '@playwright/test';

// E2E acceptance walkthrough (task C2, mvp-spec.md "Acceptance walkthrough").
// Runs against a production build served by `vite preview` — a real static
// build is what the service-worker/offline test needs (see e2e/offline.spec.ts),
// and it's also what actually ships. `webServer.command` builds on its own so
// `pnpm exec playwright test` works standalone (not just via `just e2e`);
// locally that's a cheap rebuild-on-reuse no-op once a preview server is
// already up (`reuseExistingServer`), in CI it always starts fresh.
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: 'pnpm run build && pnpm run preview',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
