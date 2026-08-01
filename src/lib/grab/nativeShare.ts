/**
 * Android native share-to-app wiring (task F2, docs/PLAN-v0.4.md). Bridges
 * two OS-level entry points into the same `onShared(text)` callback the app
 * shell (`src/routes/+layout.svelte`) uses to run the shared text through
 * the exact same `resolveSharedText` -> `stashShareTarget` -> `/add` handoff
 * the PWA's `/share` route already uses (mvp-spec.md F2) — no second parser.
 *
 * - `ShareReceiver` (`android/app/src/main/java/app/lyre/songbook/ShareReceiverPlugin.java`,
 *   hand-rolled — see that file's doc comment for why, and the PR description
 *   for the evaluation against the community `send-intent` plugin): Chrome's
 *   "Share" menu sends `ACTION_SEND` + `text/plain`, which `@capacitor/app`'s
 *   `appUrlOpen` does **not** fire for (verified, docs/PLAN-v0.4.md "Verified
 *   constraints") — only App Links and custom URL schemes do. `shareReceived`
 *   fires for both a cold start (the Intent that launched `MainActivity`) and
 *   an already-running app (`onNewIntent`, since `MainActivity` is
 *   `launchMode="singleTask"`), and the Java side retains a cold-start event
 *   until this listener attaches (`notifyListeners(..., true)`), so there's
 *   no race between the Intent arriving and the WebView finishing boot.
 * - `@capacitor/app`'s `appUrlOpen`: the `ACTION_VIEW` https App Link
 *   intent-filter (also registered in `AndroidManifest.xml`) — opening a
 *   chord-site link "with Lyre" from the chooser (no `assetlinks.json`, so
 *   never silently auto-verified — see `AndroidManifest.xml`'s comment).
 *
 * No-op (returns a no-op cleanup) on any non-native platform — every native
 * call below is gated behind `Capacitor.isNativePlatform()`, since
 * `@capacitor/core`'s web fallback throws "not implemented" for plugin
 * methods with no registered web implementation.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';

interface ShareReceivedEvent {
	text: string;
}

interface ShareReceiverPlugin {
	addListener(
		eventName: 'shareReceived',
		listenerFunc: (event: ShareReceivedEvent) => void
	): Promise<PluginListenerHandle>;
}

const ShareReceiver = registerPlugin<ShareReceiverPlugin>('ShareReceiver');

/**
 * Attach both listeners and call `onShared` with the raw shared text/URL
 * whenever either fires. Returns a cleanup function that removes both —
 * mirrors the `onMount` cleanup-return convention already used elsewhere in
 * the app (e.g. `defaultStore.subscribe`).
 */
export function wireNativeShare(onShared: (raw: string) => void): () => void {
	if (!Capacitor.isNativePlatform()) return () => {};

	let shareHandle: PluginListenerHandle | undefined;
	let urlHandle: PluginListenerHandle | undefined;

	void ShareReceiver.addListener('shareReceived', (event) => onShared(event.text)).then((h) => {
		shareHandle = h;
	});
	void App.addListener('appUrlOpen', (event) => onShared(event.url)).then((h) => {
		urlHandle = h;
	});

	return () => {
		void shareHandle?.remove();
		void urlHandle?.remove();
	};
}
