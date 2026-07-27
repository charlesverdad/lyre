import { describe, expect, it } from 'vitest';
import { parseChart } from '$lib/chart';
import type { ChartRecord, SongRecord } from '$lib/theory/types';
import {
	buildChartUpdatePatch,
	buildCreateSongInput,
	buildSongUpdatePatch,
	emptyMetadataForm,
	metadataFormFromRecords,
	parseTempoInput
} from './songRecord';

const { doc } = parseChart('Verse 1\nG           C\nAmazing grace how sweet the sound');

describe('parseTempoInput', () => {
	it('parses a positive integer-ish string', () => {
		expect(parseTempoInput('120')).toBe(120);
		expect(parseTempoInput(' 118.6 ')).toBe(119);
	});

	it('returns undefined for blank/invalid input', () => {
		expect(parseTempoInput('')).toBeUndefined();
		expect(parseTempoInput('   ')).toBeUndefined();
		expect(parseTempoInput('fast')).toBeUndefined();
		expect(parseTempoInput('-5')).toBeUndefined();
		expect(parseTempoInput('0')).toBeUndefined();
	});
});

describe('buildCreateSongInput', () => {
	it('maps form + parsed doc into a repo.createSong input with no grab provenance', () => {
		const form = {
			title: '  Amazing Grace  ',
			authorsInput: 'John Newton, ',
			sourceKey: 'C',
			tempoInput: '90',
			ccliNumber: ' 12345 '
		};

		const input = buildCreateSongInput(form, doc);

		expect(input.song.title).toBe('Amazing Grace');
		expect(input.song.authors).toEqual(['John Newton']);
		expect(input.song.ccliNumber).toBe('12345');
		expect(input.song.defaultKey).toBe('C');
		expect(input.song.tempoBpm).toBe(90);
		expect(input.song.aliases).toEqual([]);
		expect(input.song.topics).toEqual([]);

		expect(input.chart.name).toBe('Default');
		expect(input.chart.sourceKey).toBe('C');
		expect(input.chart.chordproSource).toContain('{key: C}');
		// Paste-flow charts never carry grab provenance (task B4 owns that field).
		expect(input.chart).not.toHaveProperty('rawGrabbedText');
		expect(input.chart).not.toHaveProperty('sourceAttribution');
		expect(input.chart).not.toHaveProperty('sourceUrl');

		expect(input.pattern).toBeUndefined();
	});

	it('carries an initial pattern through when the header parsed one', () => {
		const input = buildCreateSongInput(
			{ ...emptyMetadataForm(), title: 'Song', sourceKey: 'G' },
			doc,
			{ soundingKey: 'Ab', shapeKey: 'G', capo: 1 }
		);
		expect(input.pattern).toEqual({ label: 'My usual', soundingKey: 'Ab', shapeKey: 'G', capo: 1 });
	});

	it('omits ccliNumber/tempoBpm when blank', () => {
		const input = buildCreateSongInput(emptyMetadataForm(), doc);
		expect(input.song.ccliNumber).toBeUndefined();
		expect(input.song.tempoBpm).toBeUndefined();
	});
});

describe('buildSongUpdatePatch / buildChartUpdatePatch', () => {
	it('produces patches usable by repo.updateSong / repo.updateChart', () => {
		const form = {
			title: 'Amazing Grace',
			authorsInput: 'John Newton',
			sourceKey: 'D',
			tempoInput: '80',
			ccliNumber: ''
		};
		const songPatch = buildSongUpdatePatch(form);
		expect(songPatch.title).toBe('Amazing Grace');
		expect(songPatch.authors).toEqual(['John Newton']);
		expect(songPatch.defaultKey).toBe('D');
		expect(songPatch.ccliNumber).toBeUndefined();

		const chartPatch = buildChartUpdatePatch(doc);
		expect(chartPatch.sourceKey).toBe(doc.sourceKey);
		expect(chartPatch.chordproSource?.replace(/\[[^\]]*\]/g, '')).toContain('Amazing grace');
	});
});

describe('metadataFormFromRecords', () => {
	it('seeds the form from an existing song + chart', () => {
		const song: SongRecord = {
			id: 's1',
			title: 'Amazing Grace',
			aliases: [],
			authors: ['John Newton'],
			ccliNumber: '12345',
			defaultKey: 'G',
			tempoBpm: 90,
			topics: [],
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z'
		};
		const chart: ChartRecord = {
			id: 'c1',
			songId: 's1',
			name: 'Default',
			chordproSource: '{key: G}',
			sourceKey: 'G',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z'
		};

		const form = metadataFormFromRecords(song, chart);
		expect(form).toEqual({
			title: 'Amazing Grace',
			authorsInput: 'John Newton',
			sourceKey: 'G',
			tempoInput: '90',
			ccliNumber: '12345'
		});
	});
});
