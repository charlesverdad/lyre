import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyreStore } from './store';
import { createTestStore, StorageQuotaError } from './store';
import {
	createSong,
	deleteSong,
	getSongWithDetails,
	listSongs,
	listSongsWithDefaultPattern,
	savePattern,
	searchSongs,
	setPreferredPattern,
	touchLastPlayed,
	updateChart,
	updateSong,
	updateSongAndChart
} from './repo';
import { exportLibrary, importLibrary } from './exportImport';
import type { ChartRecord, SongRecord } from '$lib/theory/types';

let store: LyreStore;

beforeEach(() => {
	store = createTestStore();
});

function songInput(overrides: Partial<Omit<SongRecord, 'id' | 'createdAt' | 'updatedAt'>> = {}) {
	return {
		title: 'Goodness of God',
		aliases: [],
		authors: ['Bethel Music'],
		defaultKey: 'Ab',
		topics: [],
		...overrides
	};
}

function chartInput(
	overrides: Partial<Omit<ChartRecord, 'id' | 'songId' | 'createdAt' | 'updatedAt'>> = {}
) {
	return {
		name: 'Default',
		chordproSource: '{title: Goodness of God}\n[G]I love You Lord',
		sourceKey: 'Ab',
		...overrides
	};
}

describe('createSong', () => {
	it('creates a song, chart, and initial preferred pattern in one call', async () => {
		const result = await createSong(
			{
				song: songInput(),
				chart: chartInput(),
				pattern: { label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 }
			},
			store
		);

		expect(result.song.id).toBeTruthy();
		expect(result.chart.songId).toBe(result.song.id);
		expect(result.pattern?.chartId).toBe(result.chart.id);
		expect(result.pattern?.isPreferred).toBe(true);

		const details = await getSongWithDetails(result.song.id, store);
		expect(details?.song.title).toBe('Goodness of God');
		expect(details?.charts[0].chordproSource).toContain('I love You Lord');
	});

	it('creates a song with no initial pattern when omitted', async () => {
		const result = await createSong({ song: songInput(), chart: chartInput() }, store);
		expect(result.pattern).toBeUndefined();
		const details = await getSongWithDetails(result.song.id, store);
		expect(details?.charts[0].patterns).toHaveLength(0);
	});
});

describe('updateSong / updateChart', () => {
	it('patches fields and bumps updatedAt', async () => {
		const { song, chart } = await createSong({ song: songInput(), chart: chartInput() }, store);

		await new Promise((resolve) => setTimeout(resolve, 2));
		await updateSong(song.id, { title: 'Goodness of God (Live)' }, store);
		await updateChart(chart.id, { name: 'Acoustic' }, store);

		const details = await getSongWithDetails(song.id, store);
		expect(details?.song.title).toBe('Goodness of God (Live)');
		expect(details?.song.updatedAt).not.toBe(song.updatedAt);
		expect(details?.charts[0].name).toBe('Acoustic');
	});

	it('is a silent no-op for a missing id, matching the old Dexie `update` behavior', async () => {
		await expect(updateSong('nonexistent', { title: 'x' }, store)).resolves.toBeUndefined();
		await expect(updateChart('nonexistent', { name: 'x' }, store)).resolves.toBeUndefined();
	});
});

describe('updateSongAndChart', () => {
	it('applies both patches', async () => {
		const { song, chart } = await createSong({ song: songInput(), chart: chartInput() }, store);

		await updateSongAndChart(
			{
				songId: song.id,
				songPatch: { title: 'Goodness of God (Live)' },
				chartId: chart.id,
				chartPatch: { name: 'Acoustic' }
			},
			store
		);

		const details = await getSongWithDetails(song.id, store);
		expect(details?.song.title).toBe('Goodness of God (Live)');
		expect(details?.charts[0].name).toBe('Acoustic');
	});

	// Review fix (task E1, worth-fixing #5): the edit screen used to call
	// `updateSong` then `updateChart` as two separate `store.mutate`s, so a
	// quota failure on the second write persisted the song patch but lost the
	// chart patch it was submitted together with. `updateSongAndChart` does
	// both in one `mutate` call, so it's genuinely atomic: a failure leaves
	// *neither* patch applied.
	it('is a single store.mutate call, so a quota failure on the combined write leaves neither patch applied', async () => {
		const { song, chart } = await createSong({ song: songInput(), chart: chartInput() }, store);

		const mutateSpy = vi.spyOn(store, 'mutate');
		mutateSpy.mockImplementationOnce((fn) => {
			// Let the mutator run (so we can assert it never persists), then
			// force the same quota failure `store.mutate` itself would surface.
			const draft = structuredClone(store.read((d) => d));
			fn(draft);
			throw new StorageQuotaError();
		});

		await expect(
			updateSongAndChart(
				{
					songId: song.id,
					songPatch: { title: 'Should not persist' },
					chartId: chart.id,
					chartPatch: { name: 'Should not persist either' }
				},
				store
			)
		).rejects.toThrow(StorageQuotaError);

		expect(mutateSpy).toHaveBeenCalledTimes(1);
		const details = await getSongWithDetails(song.id, store);
		expect(details?.song.title).toBe(song.title);
		expect(details?.charts[0].name).toBe(chart.name);

		mutateSpy.mockRestore();
	});
});

describe('deleteSong', () => {
	it('cascades to charts and patterns', async () => {
		const { song, chart, pattern } = await createSong(
			{
				song: songInput(),
				chart: chartInput(),
				pattern: { label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 }
			},
			store
		);
		await savePattern(
			{ chartId: chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			store
		);

		await deleteSong(song.id, store);

		expect(await getSongWithDetails(song.id, store)).toBeUndefined();
		const remainingPatterns = store.read((doc) =>
			doc.patterns.filter((p) => p.chartId === chart.id)
		);
		expect(remainingPatterns).toHaveLength(0);
		expect(store.read((doc) => doc.patterns.some((p) => p.id === pattern!.id))).toBe(false);
	});

	it('does not touch other songs', async () => {
		const a = await createSong(
			{ song: songInput({ title: 'Song A' }), chart: chartInput() },
			store
		);
		const b = await createSong(
			{ song: songInput({ title: 'Song B' }), chart: chartInput() },
			store
		);

		await deleteSong(a.song.id, store);

		expect(await getSongWithDetails(b.song.id, store)).toBeDefined();
	});
});

describe('preferred pattern invariant', () => {
	it('savePattern makes the first pattern preferred automatically', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, store);
		const pattern = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			store
		);
		expect(pattern.isPreferred).toBe(true);
	});

	it('setPreferredPattern enforces exactly one preferred per chart', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, store);
		const p1 = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			store
		);
		const p2 = await savePattern(
			{ chartId: chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			store
		);

		// p1 was preferred by default (first pattern); p2 should not be.
		let all = store.read((doc) => doc.patterns.filter((p) => p.chartId === chart.id));
		expect(all.filter((p) => p.isPreferred)).toHaveLength(1);
		expect(all.find((p) => p.id === p1.id)?.isPreferred).toBe(true);

		await setPreferredPattern(p2.id, store);

		all = store.read((doc) => doc.patterns.filter((p) => p.chartId === chart.id));
		const preferred = all.filter((p) => p.isPreferred);
		expect(preferred).toHaveLength(1);
		expect(preferred[0].id).toBe(p2.id);
	});

	it('setPreferredPattern throws for an unknown pattern id', async () => {
		await expect(setPreferredPattern('nonexistent', store)).rejects.toThrow(/no pattern/);
	});

	it('savePattern forces isPreferred true for a chart first pattern even if caller passes false', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, store);
		const pattern = await savePattern(
			{
				chartId: chart.id,
				label: 'My usual',
				soundingKey: 'A',
				shapeKey: 'G',
				capo: 2,
				isPreferred: false
			},
			store
		);

		expect(pattern.isPreferred).toBe(true);
		const stored = store.read((doc) => doc.patterns.find((p) => p.id === pattern.id));
		expect(stored?.isPreferred).toBe(true);
	});

	it('savePattern with isPreferred: true demotes the previous preferred', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, store);
		const p1 = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			store
		);
		const p2 = await savePattern(
			{
				chartId: chart.id,
				label: 'With Sarah',
				soundingKey: 'G',
				shapeKey: 'G',
				capo: 0,
				isPreferred: true
			},
			store
		);

		const reloadedP1 = store.read((doc) => doc.patterns.find((p) => p.id === p1.id));
		const reloadedP2 = store.read((doc) => doc.patterns.find((p) => p.id === p2.id));
		expect(reloadedP1?.isPreferred).toBe(false);
		expect(reloadedP2?.isPreferred).toBe(true);
	});

	it('savePattern with an existing id updates that pattern in place instead of inserting', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, store);
		const original = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			store
		);

		const updated = await savePattern(
			{
				id: original.id,
				chartId: chart.id,
				label: 'My usual',
				soundingKey: 'Bb',
				shapeKey: 'A',
				capo: 1,
				isPreferred: true
			},
			store
		);

		expect(updated.id).toBe(original.id);
		const all = store.read((doc) => doc.patterns.filter((p) => p.chartId === chart.id));
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({ id: original.id, soundingKey: 'Bb', shapeKey: 'A', capo: 1 });
	});

	it('repeated "save as my pattern" upserts leave exactly one pattern row for the chart', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, store);

		let preferredId: string | undefined;
		for (const draft of [
			{ soundingKey: 'A', shapeKey: 'G', capo: 2 },
			{ soundingKey: 'Bb', shapeKey: 'G', capo: 3 },
			{ soundingKey: 'B', shapeKey: 'G', capo: 4 }
		]) {
			const saved = await savePattern(
				{
					id: preferredId,
					chartId: chart.id,
					label: 'My usual',
					...draft,
					isPreferred: true
				},
				store
			);
			preferredId = saved.id;
		}

		const all = store.read((doc) => doc.patterns.filter((p) => p.chartId === chart.id));
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({ soundingKey: 'B', shapeKey: 'G', capo: 4, isPreferred: true });
	});

	it('upserting a non-preferred pattern to preferred still demotes the other preferred pattern', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, store);
		const p1 = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			store
		);
		const p2 = await savePattern(
			{ chartId: chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			store
		);
		expect(store.read((doc) => doc.patterns.find((p) => p.id === p2.id))?.isPreferred).toBe(false);

		const updatedP2 = await savePattern(
			{
				id: p2.id,
				chartId: chart.id,
				label: 'With Sarah',
				soundingKey: 'G',
				shapeKey: 'G',
				capo: 0,
				isPreferred: true
			},
			store
		);

		expect(updatedP2.id).toBe(p2.id);
		const reloadedP1 = store.read((doc) => doc.patterns.find((p) => p.id === p1.id));
		const reloadedP2 = store.read((doc) => doc.patterns.find((p) => p.id === p2.id));
		expect(reloadedP1?.isPreferred).toBe(false);
		expect(reloadedP2?.isPreferred).toBe(true);
		const all = store.read((doc) => doc.patterns.filter((p) => p.chartId === chart.id));
		expect(all).toHaveLength(2);
	});
});

describe('getSongWithDetails', () => {
	it('nests charts and each chart patterns', async () => {
		const { song, chart } = await createSong(
			{
				song: songInput(),
				chart: chartInput(),
				pattern: { label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 }
			},
			store
		);

		const details = await getSongWithDetails(song.id, store);
		expect(details?.song.id).toBe(song.id);
		expect(details?.charts).toHaveLength(1);
		expect(details?.charts[0].id).toBe(chart.id);
		expect(details?.charts[0].patterns).toHaveLength(1);
		expect(details?.charts[0].patterns[0].label).toBe('My usual');
	});

	it('returns undefined for a missing song', async () => {
		expect(await getSongWithDetails('nonexistent', store)).toBeUndefined();
	});
});

describe('listSongs sort orders', () => {
	async function seedThree(): Promise<{ zebra: SongRecord; apple: SongRecord; mango: SongRecord }> {
		const zebra = (
			await createSong({ song: songInput({ title: 'Zebra Song' }), chart: chartInput() }, store)
		).song;
		await new Promise((resolve) => setTimeout(resolve, 2));
		const apple = (
			await createSong({ song: songInput({ title: 'Apple Song' }), chart: chartInput() }, store)
		).song;
		await new Promise((resolve) => setTimeout(resolve, 2));
		const mango = (
			await createSong({ song: songInput({ title: 'Mango Song' }), chart: chartInput() }, store)
		).song;
		return { zebra, apple, mango };
	}

	it('alpha sorts case-insensitively by title', async () => {
		await seedThree();
		const songs = await listSongs('alpha', store);
		expect(songs.map((s) => s.title)).toEqual(['Apple Song', 'Mango Song', 'Zebra Song']);
	});

	it('recentlyAdded sorts newest createdAt first', async () => {
		const { zebra, apple, mango } = await seedThree();
		const songs = await listSongs('recentlyAdded', store);
		expect(songs.map((s) => s.id)).toEqual([mango.id, apple.id, zebra.id]);
	});

	it('recentlyPlayed sorts newest lastPlayedAt first, unplayed last', async () => {
		const { zebra, apple, mango } = await seedThree();

		await touchLastPlayed(zebra.id, store);
		await new Promise((resolve) => setTimeout(resolve, 2));
		await touchLastPlayed(apple.id, store);
		// mango never played.

		const songs = await listSongs('recentlyPlayed', store);
		expect(songs.map((s) => s.id)).toEqual([apple.id, zebra.id, mango.id]);
	});
});

describe('listSongsWithDefaultPattern', () => {
	it('returns undefined chart/pattern for a song with no charts or patterns', async () => {
		await createSong({ song: songInput({ title: 'No Pattern Yet' }), chart: chartInput() }, store);

		const [entry] = await listSongsWithDefaultPattern('alpha', store);

		expect(entry.song.title).toBe('No Pattern Yet');
		expect(entry.defaultChart).toBeDefined();
		expect(entry.preferredPattern).toBeUndefined();
	});

	it('picks the preferred pattern of the chart named "Default"', async () => {
		const { song, chart } = await createSong(
			{
				song: songInput({ title: 'Goodness of God' }),
				chart: chartInput({ name: 'Default' }),
				pattern: { label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 }
			},
			store
		);
		// A second, non-preferred pattern on the same chart must not win.
		await savePattern(
			{ chartId: chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			store
		);
		// A second chart (an alternate arrangement) must not be picked over "Default".
		store.mutate((doc) => {
			doc.charts.push({
				id: crypto.randomUUID(),
				songId: song.id,
				name: 'Acoustic',
				chordproSource: '{title: Alt}\n[C]Alt',
				sourceKey: 'C',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});
		});

		const [entry] = await listSongsWithDefaultPattern('alpha', store);

		expect(entry.defaultChart?.id).toBe(chart.id);
		expect(entry.preferredPattern?.label).toBe('My usual');
	});

	it('falls back to the earliest-created chart when none is named "Default"', async () => {
		const { song, chart: firstChart } = await createSong(
			{ song: songInput({ title: 'Two Charts' }), chart: chartInput({ name: 'Acoustic' }) },
			store
		);
		await new Promise((resolve) => setTimeout(resolve, 2));
		store.mutate((doc) => {
			doc.charts.push({
				id: crypto.randomUUID(),
				songId: song.id,
				name: 'Electric',
				chordproSource: '{title: Two Charts}\n[C]Later',
				sourceKey: 'C',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});
		});

		const [entry] = await listSongsWithDefaultPattern('alpha', store);

		expect(entry.defaultChart?.id).toBe(firstChart.id);
	});

	it('resolves everything in a single store.read call regardless of library size (no N+1)', async () => {
		for (let i = 0; i < 5; i++) {
			await createSong(
				{
					song: songInput({ title: `Song ${i}` }),
					chart: chartInput({ name: 'Default' }),
					pattern: { label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: i }
				},
				store
			);
		}

		const readSpy = vi.spyOn(store, 'read');
		const entries = await listSongsWithDefaultPattern('alpha', store);

		expect(entries).toHaveLength(5);
		expect(readSpy).toHaveBeenCalledTimes(1);

		readSpy.mockRestore();
	});
});

describe('searchSongs', () => {
	it('matches title, author, and lyrics case-insensitively', async () => {
		await createSong(
			{
				song: songInput({ title: 'Goodness of God', authors: ['Bethel Music'] }),
				chart: chartInput({ chordproSource: '[G]I love You [C]Lord' })
			},
			store
		);
		await createSong(
			{
				song: songInput({ title: 'Amazing Grace', authors: ['John Newton'] }),
				chart: chartInput({ chordproSource: '[G]Amazing grace how sweet the sound' })
			},
			store
		);

		expect((await searchSongs('goodness', store)).map((s) => s.title)).toEqual(['Goodness of God']);
		expect((await searchSongs('BETHEL', store)).map((s) => s.title)).toEqual(['Goodness of God']);
		expect((await searchSongs('sweet the sound', store)).map((s) => s.title)).toEqual([
			'Amazing Grace'
		]);
		expect(await searchSongs('nonexistent query', store)).toEqual([]);
	});

	it('returns all songs alphabetically for an empty query', async () => {
		await createSong({ song: songInput({ title: 'Zebra' }), chart: chartInput() }, store);
		await createSong({ song: songInput({ title: 'Apple' }), chart: chartInput() }, store);
		expect((await searchSongs('  ', store)).map((s) => s.title)).toEqual(['Apple', 'Zebra']);
	});
});

describe('export / import round trip', () => {
	it('is lossless for songs, charts, and patterns', async () => {
		const first = await createSong(
			{
				song: songInput({ title: 'Goodness of God' }),
				chart: chartInput(),
				pattern: { label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 }
			},
			store
		);
		await savePattern(
			{ chartId: first.chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			store
		);
		await createSong(
			{ song: songInput({ title: 'Amazing Grace' }), chart: chartInput({ name: 'Hymnal' }) },
			store
		);

		const zip = await exportLibrary(store);

		const target = createTestStore();
		const result = await importLibrary(zip, target);

		expect(result).toEqual({
			songsImported: 2,
			songsSkipped: 0,
			collectionsImported: 0,
			collectionsSkipped: 0
		});

		const sortById = <T extends { id: string }>(records: T[]) =>
			[...records].sort((a, b) => a.id.localeCompare(b.id));

		const source = store.read((doc) => doc);
		const imported = target.read((doc) => doc);
		expect(sortById(imported.songs)).toEqual(sortById(source.songs));
		expect(sortById(imported.charts)).toEqual(sortById(source.charts));
		expect(sortById(imported.patterns)).toEqual(sortById(source.patterns));
	});

	it('skips songs whose id already exists on import, keeping others', async () => {
		const existing = await createSong(
			{ song: songInput({ title: 'Goodness of God' }), chart: chartInput() },
			store
		);

		const zip = await exportLibrary(store);

		// Target already has a song with the same id (pretend it was edited
		// there) — import must skip it, not overwrite.
		const target = createTestStore();
		target.mutate((doc) => {
			doc.songs.push({ ...existing.song, title: 'Edited Locally' });
			doc.charts.push(existing.chart);
		});

		const newSong = await createSong(
			{ song: songInput({ title: 'Amazing Grace' }), chart: chartInput() },
			store
		);
		const zip2 = await exportLibrary(store);

		const result = await importLibrary(zip2, target);
		expect(result).toEqual({
			songsImported: 1,
			songsSkipped: 1,
			collectionsImported: 0,
			collectionsSkipped: 0
		});

		const targetSong = target.read((doc) => doc.songs.find((s) => s.id === existing.song.id));
		expect(targetSong?.title).toBe('Edited Locally');
		expect(await getSongWithDetails(newSong.song.id, target)).toBeDefined();
		void zip; // exported once above to exercise the basic path too
	});

	it('rejects a zip with an unsupported schema version', async () => {
		await createSong({ song: songInput(), chart: chartInput() }, store);
		const zip = await exportLibrary(store);

		const { unzipSync, strFromU8, strToU8, zipSync } = await import('fflate');
		const files = unzipSync(zip);
		const manifest = JSON.parse(strFromU8(files['manifest.json']));
		manifest.schemaVersion = 999;
		files['manifest.json'] = strToU8(JSON.stringify(manifest));
		const badZip = zipSync(files, { level: 0 });

		const target = createTestStore();
		await expect(importLibrary(badZip, target)).rejects.toThrow(/schemaVersion/);
	});

	it('carries always-empty collections/collectionItems arrays through the manifest (task E1 plumbing for E2)', async () => {
		await createSong({ song: songInput(), chart: chartInput() }, store);
		const zip = await exportLibrary(store);

		const { unzipSync, strFromU8 } = await import('fflate');
		const manifest = JSON.parse(strFromU8(unzipSync(zip)['manifest.json']));
		expect(manifest.collections).toEqual([]);
		expect(manifest.collectionItems).toEqual([]);
	});

	it('accepts a genuine v1 archive missing the collections/collectionItems fields', async () => {
		// Simulates a real pre-E1 backup: schemaVersion 1, and the manifest
		// literally never had `collections`/`collectionItems` keys (not just
		// empty arrays) — the owner's real v1 backups look like this, and
		// losing the ability to restore them is not acceptable.
		await createSong({ song: songInput(), chart: chartInput() }, store);
		const zip = await exportLibrary(store);

		const { unzipSync, strFromU8, strToU8, zipSync } = await import('fflate');
		const files = unzipSync(zip);
		const manifest = JSON.parse(strFromU8(files['manifest.json']));
		manifest.schemaVersion = 1;
		delete manifest.collections;
		delete manifest.collectionItems;
		files['manifest.json'] = strToU8(JSON.stringify(manifest));
		const legacyZip = zipSync(files, { level: 0 });

		const target = createTestStore();
		await expect(importLibrary(legacyZip, target)).resolves.toEqual({
			songsImported: 1,
			songsSkipped: 0,
			collectionsImported: 0,
			collectionsSkipped: 0
		});
	});
});
