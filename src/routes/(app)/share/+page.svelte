<script lang="ts">
	/**
	 * PWA share-target landing page (task D1, mvp-spec.md F2 — the manifest's
	 * `share_target` points here, `static/manifest.webmanifest`). Android's
	 * share sheet navigates here with `?title=&text=&url=` GET params; this
	 * page reads them client-side (adapter-static has no server to read a
	 * query string at build/request time — `$app/state`'s `page.url` is the
	 * real navigated-to URL, populated after hydration same as any other
	 * client-side route) and immediately hands off to `/add`.
	 *
	 * iOS doesn't support web share targets at all (no `share_target` entry
	 * point exists there) — this route is Android-only until a Capacitor
	 * wrapper adds a native share extension (see docs/mvp-spec.md's PWA
	 * note and the roadmap).
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { stashShareTarget } from '$lib/addedit';
	import { safeHttpUrl } from '$lib/grab';

	onMount(() => {
		const params = page.url.searchParams;
		const url = params.get('url')?.trim();
		const text = params.get('text')?.trim();

		// Prefer an explicit `url` param; some browsers instead put the shared
		// link in `text` (e.g. sharing a link with no selected text) — treat
		// that the same way if it's itself just a URL. Otherwise, fall through
		// to the plain-text paste flow.
		const sharedUrl = url && safeHttpUrl(url) ? url : text && safeHttpUrl(text) ? text : undefined;

		if (sharedUrl) {
			stashShareTarget({ url: sharedUrl });
		} else if (text) {
			stashShareTarget({ text });
		}

		goto(resolve('/(app)/add'), { replaceState: true });
	});
</script>

<svelte:head>
	<title>Add — Lyre</title>
</svelte:head>

<p class="px-4 py-8 text-center text-[13px] text-ink-3">Opening…</p>
