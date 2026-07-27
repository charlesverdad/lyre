import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LyreDatabase } from './schema';
import { createTestDatabase } from './schema';
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
	updateSong
} from './repo';
import { exportLibrary, importLibrary } from './exportImport';
import type { ChartRecord, SongRecord } from '$lib/theory/types';

let db: LyreDatabase;
let dbCounter = 0;

beforeEach(() => {
	dbCounter += 1;
	db = createTestDatabase(`lyre-test-${dbCounter}-${Math.random().toString(36).slice(2)}`);
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
			db
		);

		expect(result.song.id).toBeTruthy();
		expect(result.chart.songId).toBe(result.song.id);
		expect(result.pattern?.chartId).toBe(result.chart.id);
		expect(result.pattern?.isPreferred).toBe(true);

		const stored = await db.songs.get(result.song.id);
		expect(stored?.title).toBe('Goodness of God');
		const storedChart = await db.charts.get(result.chart.id);
		expect(storedChart?.chordproSource).toContain('I love You Lord');
	});

	it('creates a song with no initial pattern when omitted', async () => {
		const result = await createSong({ song: songInput(), chart: chartInput() }, db);
		expect(result.pattern).toBeUndefined();
		const patterns = await db.patterns.where('chartId').equals(result.chart.id).toArray();
		expect(patterns).toHaveLength(0);
	});
});

describe('updateSong / updateChart', () => {
	it('patches fields and bumps updatedAt', async () => {
		const { song, chart } = await createSong({ song: songInput(), chart: chartInput() }, db);

		await new Promise((resolve) => setTimeout(resolve, 2));
		await updateSong(song.id, { title: 'Goodness of God (Live)' }, db);
		await updateChart(chart.id, { name: 'Acoustic' }, db);

		const updatedSong = await db.songs.get(song.id);
		const updatedChart = await db.charts.get(chart.id);
		expect(updatedSong?.title).toBe('Goodness of God (Live)');
		expect(updatedSong?.updatedAt).not.toBe(song.updatedAt);
		expect(updatedChart?.name).toBe('Acoustic');
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
			db
		);
		await savePattern(
			{ chartId: chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			db
		);

		await deleteSong(song.id, db);

		expect(await db.songs.get(song.id)).toBeUndefined();
		expect(await db.charts.get(chart.id)).toBeUndefined();
		expect(await db.patterns.get(pattern!.id)).toBeUndefined();
		const remainingPatterns = await db.patterns.where('chartId').equals(chart.id).toArray();
		expect(remainingPatterns).toHaveLength(0);
	});

	it('does not touch other songs', async () => {
		const a = await createSong({ song: songInput({ title: 'Song A' }), chart: chartInput() }, db);
		const b = await createSong({ song: songInput({ title: 'Song B' }), chart: chartInput() }, db);

		await deleteSong(a.song.id, db);

		expect(await db.songs.get(b.song.id)).toBeDefined();
		expect(await db.charts.get(b.chart.id)).toBeDefined();
	});
});

describe('preferred pattern invariant', () => {
	it('savePattern makes the first pattern preferred automatically', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, db);
		const pattern = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			db
		);
		expect(pattern.isPreferred).toBe(true);
	});

	it('setPreferredPattern enforces exactly one preferred per chart', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, db);
		const p1 = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			db
		);
		const p2 = await savePattern(
			{ chartId: chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			db
		);

		// p1 was preferred by default (first pattern); p2 should not be.
		let all = await db.patterns.where('chartId').equals(chart.id).toArray();
		expect(all.filter((p) => p.isPreferred)).toHaveLength(1);
		expect(all.find((p) => p.id === p1.id)?.isPreferred).toBe(true);

		await setPreferredPattern(p2.id, db);

		all = await db.patterns.where('chartId').equals(chart.id).toArray();
		const preferred = all.filter((p) => p.isPreferred);
		expect(preferred).toHaveLength(1);
		expect(preferred[0].id).toBe(p2.id);
	});

	it('savePattern forces isPreferred true for a chart first pattern even if caller passes false', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, db);
		const pattern = await savePattern(
			{
				chartId: chart.id,
				label: 'My usual',
				soundingKey: 'A',
				shapeKey: 'G',
				capo: 2,
				isPreferred: false
			},
			db
		);

		expect(pattern.isPreferred).toBe(true);
		const stored = await db.patterns.get(pattern.id);
		expect(stored?.isPreferred).toBe(true);
	});

	it('savePattern with isPreferred: true demotes the previous preferred', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, db);
		const p1 = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			db
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
			db
		);

		const reloadedP1 = await db.patterns.get(p1.id);
		const reloadedP2 = await db.patterns.get(p2.id);
		expect(reloadedP1?.isPreferred).toBe(false);
		expect(reloadedP2?.isPreferred).toBe(true);
	});

	it('savePattern with an existing id updates that pattern in place instead of inserting', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, db);
		const original = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			db
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
			db
		);

		expect(updated.id).toBe(original.id);
		const all = await db.patterns.where('chartId').equals(chart.id).toArray();
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({ id: original.id, soundingKey: 'Bb', shapeKey: 'A', capo: 1 });
	});

	it('repeated "save as my pattern" upserts leave exactly one pattern row for the chart', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, db);

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
				db
			);
			preferredId = saved.id;
		}

		const all = await db.patterns.where('chartId').equals(chart.id).toArray();
		expect(all).toHaveLength(1);
		expect(all[0]).toMatchObject({ soundingKey: 'B', shapeKey: 'G', capo: 4, isPreferred: true });
	});

	it('upserting a non-preferred pattern to preferred still demotes the other preferred pattern', async () => {
		const { chart } = await createSong({ song: songInput(), chart: chartInput() }, db);
		const p1 = await savePattern(
			{ chartId: chart.id, label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: 2 },
			db
		);
		const p2 = await savePattern(
			{ chartId: chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			db
		);
		expect((await db.patterns.get(p2.id))?.isPreferred).toBe(false);

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
			db
		);

		expect(updatedP2.id).toBe(p2.id);
		const reloadedP1 = await db.patterns.get(p1.id);
		const reloadedP2 = await db.patterns.get(p2.id);
		expect(reloadedP1?.isPreferred).toBe(false);
		expect(reloadedP2?.isPreferred).toBe(true);
		const all = await db.patterns.where('chartId').equals(chart.id).toArray();
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
			db
		);

		const details = await getSongWithDetails(song.id, db);
		expect(details?.song.id).toBe(song.id);
		expect(details?.charts).toHaveLength(1);
		expect(details?.charts[0].id).toBe(chart.id);
		expect(details?.charts[0].patterns).toHaveLength(1);
		expect(details?.charts[0].patterns[0].label).toBe('My usual');
	});

	it('returns undefined for a missing song', async () => {
		expect(await getSongWithDetails('nonexistent', db)).toBeUndefined();
	});
});

describe('listSongs sort orders', () => {
	async function seedThree(): Promise<{ zebra: SongRecord; apple: SongRecord; mango: SongRecord }> {
		const zebra = (
			await createSong({ song: songInput({ title: 'Zebra Song' }), chart: chartInput() }, db)
		).song;
		await new Promise((resolve) => setTimeout(resolve, 2));
		const apple = (
			await createSong({ song: songInput({ title: 'Apple Song' }), chart: chartInput() }, db)
		).song;
		await new Promise((resolve) => setTimeout(resolve, 2));
		const mango = (
			await createSong({ song: songInput({ title: 'Mango Song' }), chart: chartInput() }, db)
		).song;
		return { zebra, apple, mango };
	}

	it('alpha sorts case-insensitively by title', async () => {
		await seedThree();
		const songs = await listSongs('alpha', db);
		expect(songs.map((s) => s.title)).toEqual(['Apple Song', 'Mango Song', 'Zebra Song']);
	});

	it('recentlyAdded sorts newest createdAt first', async () => {
		const { zebra, apple, mango } = await seedThree();
		const songs = await listSongs('recentlyAdded', db);
		expect(songs.map((s) => s.id)).toEqual([mango.id, apple.id, zebra.id]);
	});

	it('recentlyPlayed sorts newest lastPlayedAt first, unplayed last', async () => {
		const { zebra, apple, mango } = await seedThree();

		await touchLastPlayed(zebra.id, db);
		await new Promise((resolve) => setTimeout(resolve, 2));
		await touchLastPlayed(apple.id, db);
		// mango never played.

		const songs = await listSongs('recentlyPlayed', db);
		expect(songs.map((s) => s.id)).toEqual([apple.id, zebra.id, mango.id]);
	});
});

describe('listSongsWithDefaultPattern', () => {
	it('returns undefined chart/pattern for a song with no charts or patterns', async () => {
		await createSong({ song: songInput({ title: 'No Pattern Yet' }), chart: chartInput() }, db);

		const [entry] = await listSongsWithDefaultPattern('alpha', db);

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
			db
		);
		// A second, non-preferred pattern on the same chart must not win.
		await savePattern(
			{ chartId: chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			db
		);
		// A second chart (an alternate arrangement) must not be picked over "Default".
		await database_addAlternateChart(song.id);

		const [entry] = await listSongsWithDefaultPattern('alpha', db);

		expect(entry.defaultChart?.id).toBe(chart.id);
		expect(entry.preferredPattern?.label).toBe('My usual');
	});

	async function database_addAlternateChart(songId: string) {
		await db.charts.add({
			id: crypto.randomUUID(),
			songId,
			name: 'Acoustic',
			chordproSource: '{title: Alt}\n[C]Alt',
			sourceKey: 'C',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	it('falls back to the earliest-created chart when none is named "Default"', async () => {
		const { song, chart: firstChart } = await createSong(
			{ song: songInput({ title: 'Two Charts' }), chart: chartInput({ name: 'Acoustic' }) },
			db
		);
		await new Promise((resolve) => setTimeout(resolve, 2));
		await db.charts.add({
			id: crypto.randomUUID(),
			songId: song.id,
			name: 'Electric',
			chordproSource: '{title: Two Charts}\n[C]Later',
			sourceKey: 'C',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});

		const [entry] = await listSongsWithDefaultPattern('alpha', db);

		expect(entry.defaultChart?.id).toBe(firstChart.id);
	});

	it('batches into a fixed number of table scans regardless of library size', async () => {
		for (let i = 0; i < 5; i++) {
			await createSong(
				{
					song: songInput({ title: `Song ${i}` }),
					chart: chartInput({ name: 'Default' }),
					pattern: { label: 'My usual', soundingKey: 'A', shapeKey: 'G', capo: i }
				},
				db
			);
		}

		const songsSpy = vi.spyOn(db.songs, 'toArray');
		const chartsSpy = vi.spyOn(db.charts, 'where');
		const patternsSpy = vi.spyOn(db.patterns, 'where');

		const entries = await listSongsWithDefaultPattern('alpha', db);

		expect(entries).toHaveLength(5);
		// One scan for songs, one `anyOf` lookup for charts, one for patterns —
		// not one query per song (see repo.ts doc comment: "no N+1").
		expect(songsSpy).toHaveBeenCalledTimes(1);
		expect(chartsSpy).toHaveBeenCalledTimes(1);
		expect(patternsSpy).toHaveBeenCalledTimes(1);

		songsSpy.mockRestore();
		chartsSpy.mockRestore();
		patternsSpy.mockRestore();
	});
});

describe('searchSongs', () => {
	it('matches title, author, and lyrics case-insensitively', async () => {
		await createSong(
			{
				song: songInput({ title: 'Goodness of God', authors: ['Bethel Music'] }),
				chart: chartInput({ chordproSource: '[G]I love You [C]Lord' })
			},
			db
		);
		await createSong(
			{
				song: songInput({ title: 'Amazing Grace', authors: ['John Newton'] }),
				chart: chartInput({ chordproSource: '[G]Amazing grace how sweet the sound' })
			},
			db
		);

		expect((await searchSongs('goodness', db)).map((s) => s.title)).toEqual(['Goodness of God']);
		expect((await searchSongs('BETHEL', db)).map((s) => s.title)).toEqual(['Goodness of God']);
		expect((await searchSongs('sweet the sound', db)).map((s) => s.title)).toEqual([
			'Amazing Grace'
		]);
		expect(await searchSongs('nonexistent query', db)).toEqual([]);
	});

	it('returns all songs alphabetically for an empty query', async () => {
		await createSong({ song: songInput({ title: 'Zebra' }), chart: chartInput() }, db);
		await createSong({ song: songInput({ title: 'Apple' }), chart: chartInput() }, db);
		expect((await searchSongs('  ', db)).map((s) => s.title)).toEqual(['Apple', 'Zebra']);
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
			db
		);
		await savePattern(
			{ chartId: first.chart.id, label: 'With Sarah', soundingKey: 'G', shapeKey: 'G', capo: 0 },
			db
		);
		await createSong(
			{ song: songInput({ title: 'Amazing Grace' }), chart: chartInput({ name: 'Hymnal' }) },
			db
		);

		const zip = await exportLibrary(db);

		const target = createTestDatabase(`lyre-import-target-${Math.random().toString(36).slice(2)}`);
		const result = await importLibrary(zip, target);

		expect(result).toEqual({ songsImported: 2, songsSkipped: 0 });

		const [sourceSongs, sourceCharts, sourcePatterns] = await Promise.all([
			db.songs.toArray(),
			db.charts.toArray(),
			db.patterns.toArray()
		]);
		const [targetSongs, targetCharts, targetPatterns] = await Promise.all([
			target.songs.toArray(),
			target.charts.toArray(),
			target.patterns.toArray()
		]);

		const sortById = <T extends { id: string }>(records: T[]) =>
			[...records].sort((a, b) => a.id.localeCompare(b.id));

		expect(sortById(targetSongs)).toEqual(sortById(sourceSongs));
		expect(sortById(targetCharts)).toEqual(sortById(sourceCharts));
		expect(sortById(targetPatterns)).toEqual(sortById(sourcePatterns));
	});

	it('skips songs whose id already exists on import, keeping others', async () => {
		const existing = await createSong(
			{ song: songInput({ title: 'Goodness of God' }), chart: chartInput() },
			db
		);

		const zip = await exportLibrary(db);

		// Target already has a song with the same id (pretend it was edited
		// there) — import must skip it, not overwrite.
		const target = createTestDatabase(`lyre-import-skip-${Math.random().toString(36).slice(2)}`);
		await target.songs.add({ ...existing.song, title: 'Edited Locally' });
		await target.charts.add(existing.chart);

		const newSong = await createSong(
			{ song: songInput({ title: 'Amazing Grace' }), chart: chartInput() },
			db
		);
		const zip2 = await exportLibrary(db);

		const result = await importLibrary(zip2, target);
		expect(result).toEqual({ songsImported: 1, songsSkipped: 1 });

		const targetSong = await target.songs.get(existing.song.id);
		expect(targetSong?.title).toBe('Edited Locally');
		expect(await target.songs.get(newSong.song.id)).toBeDefined();
		void zip; // exported once above to exercise the basic path too
	});

	it('rejects a zip with an unsupported schema version', async () => {
		await createSong({ song: songInput(), chart: chartInput() }, db);
		const zip = await exportLibrary(db);

		const { unzipSync, strFromU8, strToU8, zipSync } = await import('fflate');
		const files = unzipSync(zip);
		const manifest = JSON.parse(strFromU8(files['manifest.json']));
		manifest.schemaVersion = 999;
		files['manifest.json'] = strToU8(JSON.stringify(manifest));
		const badZip = zipSync(files, { level: 0 });

		const target = createTestDatabase(`lyre-import-bad-${Math.random().toString(36).slice(2)}`);
		await expect(importLibrary(badZip, target)).rejects.toThrow(/schemaVersion/);
	});
});
