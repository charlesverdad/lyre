/**
 * Svelte 5 rune adapter over `LyreStore.subscribe` (task B1 reactivity note,
 * rewritten task E1 off Dexie's `liveQuery`): re-runs `querier` on every
 * committed store mutation (this tab) or cross-tab `storage` event, and
 * exposes its latest value as reactive `$state` — so any write anywhere in
 * the app (e.g. `deleteSong`) refreshes subscribed screens automatically, no
 * manual invalidation or "refetch on navigate" plumbing needed.
 *
 * Public shape is unchanged from the Dexie version so call sites (the
 * library screen's `untrack` pattern in particular) didn't need to change:
 *
 *   let handle = $state<LiveQueryHandle<Song[]>>();
 *   $effect(() => {
 *     const h = createLiveQuery(() => listSongs(sort), []);
 *     handle = h;
 *     return () => h.destroy();
 *   });
 *   // template: handle?.value ?? []
 */

import type { LyreStore } from './store';
import { defaultStore } from './store';

export interface LiveQueryHandle<T> {
	/** Latest emitted value; reactive when read from a template or `$derived`. */
	readonly value: T;
	/** Stop re-running the query on store changes. Call from cleanup (e.g. an `$effect` return). */
	destroy(): void;
}

/**
 * Subscribe `store` and re-run `querier` on every notification, mirroring
 * emissions into `$state`, starting from `initialValue` until the first
 * result resolves.
 */
export function createLiveQuery<T>(
	querier: () => T | Promise<T>,
	initialValue: T,
	store: LyreStore = defaultStore
): LiveQueryHandle<T> {
	let value = $state(initialValue);
	let destroyed = false;
	// Guards against an earlier, slower `run()` resolving after a later one
	// (e.g. two mutations fire in quick succession) and clobbering the
	// value with stale data — only the most recently *started* run may write.
	let runToken = 0;

	async function run() {
		const token = ++runToken;
		try {
			const next = await querier();
			if (destroyed || token !== runToken) return;
			value = next;
		} catch (err) {
			// A live query failing shouldn't crash the subscriber's render; log
			// and keep the last-known-good value on screen.
			console.error('createLiveQuery: query failed', err);
		}
	}

	void run();
	const unsubscribe = store.subscribe(() => void run());

	return {
		get value() {
			return value;
		},
		destroy() {
			destroyed = true;
			unsubscribe();
		}
	};
}
