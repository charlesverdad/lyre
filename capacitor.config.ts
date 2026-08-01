import type { CapacitorConfig } from '@capacitor/cli';

// Native Android wrapper (task F1, docs/PLAN-v0.4.md). `webDir` points at the
// static adapter's output directory, built by `just android-build` with
// `BASE_PATH` deliberately unset — the GH Pages build's `/lyre` base breaks
// every asset URL once the site is served from the webview's root instead of
// a subpath, so the native build must never see that env var.
const config: CapacitorConfig = {
	appId: 'app.lyre.songbook',
	appName: 'Lyre',
	webDir: 'build'
};

export default config;
