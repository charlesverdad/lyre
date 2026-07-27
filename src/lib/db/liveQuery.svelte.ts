/**
 * Svelte 5 rune adapter over Dexie's `liveQuery` (task B1 reactivity note):
 * subscribes a Dexie live query and exposes its latest value as reactive
 * `$state`, so any table write anywhere in the app (e.g. `deleteSong`)
 * refreshes subscribed screens automatically — no manual invalidation or
 * "refetch on navigate" plumbing needed.
 *
 * Usage from a component (recreate whenever an external dependency like a
 * sort order changes, since `liveQuery`'s auto-tracking only sees Dexie
 * table reads, not outside reactive vars):
 *
 *   let handle = $state<LiveQueryHandle<Song[]>>();
 *   $effect(() => {
 *     const h = createLiveQuery(() => listSongs(sort), []);
 *     handle = h;
 *     return () => h.destroy();
 *   });
 *   // template: handle?.value ?? []
 */

import { liveQuery } from 'dexie';

export interface LiveQueryHandle<T> {
	/** Latest emitted value; reactive when read from a template or `$derived`. */
	readonly value: T;
	/** Stop the underlying Dexie subscription. Call from cleanup (e.g. an `$effect` return). */
	destroy(): void;
}

/**
 * Wrap `querier` in a Dexie `liveQuery` and mirror its emissions into
 * `$state`, starting from `initialValue` until the first emission arrives.
 */
export function createLiveQuery<T>(
	querier: () => T | Promise<T>,
	initialValue: T
): LiveQueryHandle<T> {
	let value = $state(initialValue);

	const subscription = liveQuery(querier).subscribe({
		next: (next) => {
			value = next;
		},
		error: (err) => {
			// A live query failing shouldn't crash the subscriber's render; log
			// and keep the last-known-good value on screen.
			console.error('createLiveQuery: query failed', err);
		}
	});

	return {
		get value() {
			return value;
		},
		destroy() {
			subscription.unsubscribe();
		}
	};
}
