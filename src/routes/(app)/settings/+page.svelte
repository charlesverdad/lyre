<script lang="ts">
	import TopBar from '$lib/ui/TopBar.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Sheet from '$lib/ui/Sheet.svelte';
	import { theme, setTheme, type ThemeMode } from '$lib/ui/theme.svelte';
	import { exportLibrary, importLibrary, type ImportResult } from '$lib/db';

	// Real (small) feature: theme toggle, proving the token-override path
	// (data-theme on <html>, see src/routes/layout.css). Everything else on
	// this screen lands in later B-tasks.
	const modes: { value: ThemeMode; label: string }[] = [
		{ value: 'system', label: 'System' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];

	// --- Data safety: export/import (mvp-spec.md F5) ------------------------

	let exporting = $state(false);
	let exportError = $state<string | undefined>();

	function todayStamp(): string {
		return new Date().toISOString().slice(0, 10);
	}

	async function doExport() {
		exporting = true;
		exportError = undefined;
		try {
			const zip = await exportLibrary();
			const blob = new Blob([zip.slice().buffer], { type: 'application/zip' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `lyre-library-${todayStamp()}.zip`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			exportError = err instanceof Error ? err.message : 'Export failed.';
		} finally {
			exporting = false;
		}
	}

	let fileInput = $state<HTMLInputElement>();
	let pendingImportFile = $state<File | undefined>();
	let importSheetOpen = $state(false);
	let importing = $state(false);
	let importError = $state<string | undefined>();
	let importResult = $state<ImportResult | undefined>();

	function pickImportFile() {
		importError = undefined;
		importResult = undefined;
		fileInput?.click();
	}

	function onFileChosen(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		pendingImportFile = file;
		importSheetOpen = true;
	}

	function cancelImport() {
		importSheetOpen = false;
		pendingImportFile = undefined;
		if (fileInput) fileInput.value = '';
	}

	async function confirmImport() {
		if (!pendingImportFile) return;
		importing = true;
		importError = undefined;
		try {
			const bytes = new Uint8Array(await pendingImportFile.arrayBuffer());
			importResult = await importLibrary(bytes);
			importSheetOpen = false;
		} catch (err) {
			importError = err instanceof Error ? err.message : 'Import failed — is that a Lyre export?';
		} finally {
			importing = false;
			pendingImportFile = undefined;
			if (fileInput) fileInput.value = '';
		}
	}
</script>

<svelte:head>
	<title>Settings — Lyre</title>
</svelte:head>

<TopBar title="Settings" />

<section class="px-4">
	<h2 class="mb-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Appearance</h2>
	<div class="flex gap-2" role="radiogroup" aria-label="Theme">
		{#each modes as m (m.value)}
			<Button
				variant={theme.mode === m.value ? 'primary' : 'ghost'}
				size="sm"
				aria-pressed={theme.mode === m.value}
				onclick={() => setTheme(m.value)}
			>
				{m.label}
			</Button>
		{/each}
	</div>
</section>

<section class="mt-8 px-4">
	<h2 class="mb-2 text-[13px] font-semibold tracking-wide text-ink-2 uppercase">Data</h2>
	<p class="mb-3 text-[13px] text-ink-2">
		Export your whole library to a zip you can back up or move to another device. Import merges a
		previously exported zip into this library.
	</p>
	<div class="flex flex-col gap-2">
		<Button variant="ghost" onclick={doExport} disabled={exporting}>
			{exporting ? 'Exporting…' : 'Export library'}
		</Button>
		<Button variant="ghost" onclick={pickImportFile}>Import library</Button>
		<input
			bind:this={fileInput}
			type="file"
			accept=".zip,application/zip"
			class="hidden"
			onchange={onFileChosen}
		/>
	</div>

	{#if exportError}
		<p class="mt-2 text-[13px] text-ink-2">{exportError}</p>
	{/if}

	{#if importError}
		<p class="mt-2 text-[13px] text-ink-2">{importError}</p>
	{/if}

	{#if importResult}
		<p class="mt-2 text-[13px] text-ink-2">
			Imported {importResult.songsImported}
			{importResult.songsImported === 1 ? 'song' : 'songs'}
			{#if importResult.songsSkipped > 0}
				· skipped {importResult.songsSkipped} already in your library
			{/if}
		</p>
	{/if}
</section>

<Sheet bind:open={importSheetOpen} title="Import library" onclose={cancelImport}>
	<div class="flex flex-col gap-4 pb-2">
		<p class="text-[15px] text-ink-2">
			Import "{pendingImportFile?.name}"? Songs already in your library (matched by id) are skipped
			— everything else is added. This can't remove or overwrite existing songs.
		</p>
		<div class="flex flex-col gap-2">
			<Button size="lg" onclick={confirmImport} disabled={importing}>
				{importing ? 'Importing…' : 'Import'}
			</Button>
			<Button variant="ghost" size="lg" onclick={cancelImport} disabled={importing}>Cancel</Button>
		</div>
	</div>
</Sheet>
