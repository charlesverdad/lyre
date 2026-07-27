import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createTestDatabase } from './schema';
import { createSong } from './repo';
import { createLiveQuery } from './liveQuery.svelte';

function flush() {
	// Dexie's liveQuery batches emissions onto a microtask; a couple of ticks
	// is enough to let a write's notification propagate to subscribers.
	return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('createLiveQuery', () => {
	it('starts at the initial value before the first emission', async () => {
		const db = createTestDatabase(`livequery-initial-${Math.random().toString(36).slice(2)}`);
		const handle = createLiveQuery(() => db.songs.toArray(), []);
		try {
			expect(handle.value).toEqual([]);
		} finally {
			await flush();
			handle.destroy();
		}
	});

	it('updates reactively when the underlying table changes', async () => {
		const db = createTestDatabase(`livequery-update-${Math.random().toString(36).slice(2)}`);
		const handle = createLiveQuery(() => db.songs.toArray(), []);
		await flush();
		expect(handle.value).toEqual([]);

		await createSong(
			{
				song: {
					title: 'Goodness of God',
					aliases: [],
					authors: ['Bethel Music'],
					defaultKey: 'Ab',
					topics: []
				},
				chart: { name: 'Default', chordproSource: '[G]Hi', sourceKey: 'Ab' }
			},
			db
		);
		await flush();

		expect(handle.value).toHaveLength(1);
		expect(handle.value[0].title).toBe('Goodness of God');

		handle.destroy();
	});

	it('stops emitting after destroy()', async () => {
		const db = createTestDatabase(`livequery-destroy-${Math.random().toString(36).slice(2)}`);
		const handle = createLiveQuery(() => db.songs.toArray(), []);
		await flush();
		handle.destroy();

		await createSong(
			{
				song: {
					title: 'After Destroy',
					aliases: [],
					authors: [],
					defaultKey: 'C',
					topics: []
				},
				chart: { name: 'Default', chordproSource: '[C]Hi', sourceKey: 'C' }
			},
			db
		);
		await flush();

		expect(handle.value).toEqual([]);
	});
});
