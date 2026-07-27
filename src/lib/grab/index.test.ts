import { describe, expect, it } from 'vitest';
import { buildGrabResult, grabResultToSongInput } from './index';

// Chart body throughout is Amazing Grace (public domain) — see
// docs/licensing-and-content.md.

describe('grabResultToSongInput', () => {
	it('prefills the pattern from the grabbed header when the page stated one', () => {
		const chartText = [
			'Original in Ab. Capo 1, play in G.',
			'Verse1',
			'G',
			'Amazing grace, how sweet the sound',
			'        C              G',
			'That saved a wretch like me'
		].join('\n');
		const grabResult = buildGrabResult(
			{ title: 'Amazing Grace', artist: 'John Newton', chartText },
			{
				sourceUrl: 'https://pnwchords.com/amazing-grace/',
				sourceSite: 'pnwchords.com',
				fetchedAt: '2026-07-27T00:00:00.000Z'
			}
		);

		const input = grabResultToSongInput(grabResult);

		expect(input.song.title).toBe('Amazing Grace');
		expect(input.song.authors).toEqual(['John Newton']);
		expect(input.song.defaultKey).toBe('Ab');
		expect(input.pattern).toMatchObject({
			soundingKey: 'Ab',
			shapeKey: 'G',
			capo: 1,
			label: 'Default'
		});
		expect(input.chart.sourceKey).toBe('G');
		expect(input.chart.sourceUrl).toBe('https://pnwchords.com/amazing-grace/');
		expect(input.chart.sourceSite).toBe('pnwchords.com');
		expect(input.chart.fetchedAt).toBe('2026-07-27T00:00:00.000Z');
		expect(input.chart.rawGrabbedText).toBe(chartText);
		expect(input.chart.sourceAttribution).toBe('John Newton — via pnwchords.com');
		expect(input.chart.chordproSource).toContain('{key: G}');
		expect(input.chart.chordproSource).toContain('Amazing grace, how sweet the sound');
	});

	it('falls back to shapeKey = soundingKey = sourceKey, capo 0, when there is no header', () => {
		const chartText = [
			'Verse1',
			'D',
			'Amazing grace, how sweet the sound',
			'        A              D',
			'That saved a wretch like me'
		].join('\n');
		const grabResult = buildGrabResult(
			{ chartText },
			{
				sourceUrl: 'https://example.com/song',
				sourceSite: 'example.com',
				fetchedAt: '2026-07-27T00:00:00.000Z'
			}
		);

		const input = grabResultToSongInput(grabResult);

		expect(input.pattern).toMatchObject({ soundingKey: 'D', shapeKey: 'D', capo: 0 });
		expect(input.song.defaultKey).toBe('D');
		expect(input.song.title).toBe('Untitled');
		expect(input.song.authors).toEqual([]);
		expect(input.chart.sourceAttribution).toBe('via example.com');
	});
});
