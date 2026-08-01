<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { initTheme } from '$lib/ui/theme.svelte';
	import { requestPersistentStorage, defaultStore } from '$lib/db/store';
	import { migrateFromIndexedDbOnce, getMigrationFailure } from '$lib/db/migrateFromIndexedDb';
	import { stashShareTarget } from '$lib/addedit';
	import { resolveSharedText, wireNativeShare } from '$lib/grab';
	import { Capacitor } from '@capacitor/core';

	let { children } = $props();

	// Sync reactive theme state (used by the settings page toggle) with the
	// choice the blocking inline script in app.html already applied to <html>.
	$effect(() => {
		initTheme();
	});

	// Migration-failure retry banner (review fix, task E1): the root
	// `+layout.ts` load already awaits one migration attempt before any
	// screen renders, but a failed attempt must be recoverable in-app, not
	// just logged — this mirrors `doc.migrationFailedAt` and offers Retry /
	// Dismiss. Read directly off `defaultStore` (same pattern repo.ts uses)
	// rather than threading it through `+layout.ts` load data.
	let migrationFailedAt = $state<string | undefined>();
	let migrationBannerDismissed = $state(false);
	let retryingMigration = $state(false);

	function refreshMigrationStatus() {
		migrationFailedAt = getMigrationFailure(defaultStore);
	}

	async function retryMigration() {
		retryingMigration = true;
		try {
			await migrateFromIndexedDbOnce(defaultStore);
		} finally {
			retryingMigration = false;
			// `migrateFromIndexedDbOnce` mutates the store on both success and
			// failure, which notifies subscribers below — but read the fresh
			// value directly too, in case retry failed identically (mutate
			// still fires a notification, so this is belt-and-braces).
			refreshMigrationStatus();
		}
	}

	// Register the offline service worker (task C1, src/service-worker.ts).
	// SvelteKit doesn't register it for you — see
	// https://svelte.dev/docs/kit/service-workers.
	// Skipped inside the native app shell (task F1, docs/PLAN-v0.4.md): there's
	// no offline-fetch value when assets already ship in the APK, and caching
	// against a `capacitor://localhost` origin risks serving stale bundled
	// assets after an app update.
	// Native share-to-app handoff (task F2, docs/PLAN-v0.4.md — the release's
	// central feature). Wired at the root layout, the one choke point that
	// runs regardless of which route the app cold-starts into (see
	// `$lib/grab/nativeShare.ts`'s doc comment for the Java/plugin side): a
	// shared URL or text is classified exactly like the PWA's `/share` route
	// classifies its own params (`resolveSharedText` mirrors that shape),
	// stashed the same way (`stashShareTarget`), then handed to `/add` — same
	// hop the web share-target flow already makes, reusing its `onMount`
	// consumer there rather than duplicating the grab-trigger logic here.
	function onNativeShare(raw: string) {
		const shared = resolveSharedText(raw);
		if (!shared.url && !shared.text) return;
		stashShareTarget(shared);
		void goto(resolve('/(app)/add'), { replaceState: true });
	}

	onMount(() => {
		if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register(`${base}/service-worker.js`, { type: 'module' });
		}
		// Best-effort, never-blocking ask that the browser not evict this
		// origin's storage under pressure (task E1, docs/PLAN-v0.3.md §E1).
		requestPersistentStorage();

		refreshMigrationStatus();
		const unsubscribeMigration = defaultStore.subscribe(refreshMigrationStatus);
		const unwireNativeShare = wireNativeShare(onNativeShare);
		return () => {
			unsubscribeMigration();
			unwireNativeShare();
		};
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if migrationFailedAt && !migrationBannerDismissed}
	<div class="mx-auto max-w-[640px] border-b border-line bg-surface px-4 py-2">
		<div class="flex items-center justify-between gap-3">
			<p class="text-[13px] text-ink-2">
				Couldn't restore your library from local storage. Your old data is safe — nothing was
				deleted.
			</p>
			<div class="flex shrink-0 gap-3">
				<button
					type="button"
					class="text-[13px] font-semibold text-ink underline underline-offset-2 disabled:opacity-50"
					disabled={retryingMigration}
					onclick={retryMigration}
				>
					{retryingMigration ? 'Retrying…' : 'Retry'}
				</button>
				<button
					type="button"
					class="text-[13px] text-ink-2 underline underline-offset-2"
					onclick={() => (migrationBannerDismissed = true)}
				>
					Dismiss
				</button>
			</div>
		</div>
	</div>
{/if}

{@render children()}
