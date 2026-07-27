import { describe, expect, it } from 'vitest';
import { chartDocToChordPro, parseChordPro } from './chordpro';
import { parsePlaintextChart } from './plaintext';
import type { ChartDoc } from '../theory/types';

describe('parseChordPro', () => {
	it('parses title and key directives', () => {
		const doc = parseChordPro('{title: Amazing Grace}\n{key: G}\n[G]Amazing grace');
		expect(doc.title).toBe('Amazing Grace');
		expect(doc.sourceKey).toBe('G');
	});

	it('also accepts the short {t:} directive alias', () => {
		const doc = parseChordPro('{t: Amazing Grace}\n{key: G}\n[G]x');
		expect(doc.title).toBe('Amazing Grace');
	});

	it('places inline chords at the correct plain-text index', () => {
		const doc = parseChordPro('{key: G}\n[G]Amazing [C]grace, how [G]sweet');
		const line = doc.sections[0].lines[0];
		expect(line.lyrics).toBe('Amazing grace, how sweet');
		expect(line.chords).toEqual([
			{ chord: { degree: 0, quality: '' }, index: 0 },
			{ chord: { degree: 5, quality: '' }, index: 8 },
			{ chord: { degree: 0, quality: '' }, index: 19 }
		]);
	});

	it('parses slash chords inline', () => {
		const doc = parseChordPro('{key: G}\n[G/B]Amazing grace');
		expect(doc.sections[0].lines[0].chords[0].chord).toEqual({
			degree: 0,
			quality: '',
			bassDegree: 4
		});
	});

	it('parses {comment:}/{c:} as a plain (chordless) line', () => {
		const doc = parseChordPro('{key: G}\n{comment: Slow down here}\n[G]lyrics');
		expect(doc.sections[0].lines[0]).toEqual({ lyrics: 'Slow down here', chords: [] });
	});

	it('recognizes {soc}/{eoc} chorus markers with the default label', () => {
		const doc = parseChordPro('{key: G}\n{soc}\n[G]chorus line\n{eoc}\n[C]after chorus');
		expect(doc.sections.map((s) => s.label)).toEqual(['Chorus', undefined]);
	});

	it('recognizes {sov}/{eov} and {sob}/{eob} short markers', () => {
		const doc = parseChordPro(
			'{key: G}\n{sov}\n[G]verse line\n{eov}\n{sob}\n[C]bridge line\n{eob}'
		);
		expect(doc.sections.map((s) => s.label)).toEqual(['Verse', 'Bridge']);
	});

	it('recognizes long-form {start_of_chorus}/{end_of_chorus} directives', () => {
		const doc = parseChordPro('{key: G}\n{start_of_chorus}\n[G]x\n{end_of_chorus}');
		expect(doc.sections[0].label).toBe('Chorus');
	});

	it('honors an inline label on a section-start directive', () => {
		const doc = parseChordPro('{key: G}\n{start_of_verse: Verse 2}\n[G]x\n{end_of_verse}');
		expect(doc.sections[0].label).toBe('Verse 2');
	});

	it('recognizes plain section-label lines too (e.g. "Bridge")', () => {
		const doc = parseChordPro('{key: G}\nBridge\n[G]bridge line');
		expect(doc.sections[0].label).toBe('Bridge');
	});

	it('drops unrecognized directives without misreading them as lyrics', () => {
		const doc = parseChordPro('{key: G}\n{tempo: 90}\n[G]lyrics');
		expect(doc.sections[0].lines).toEqual([
			{ lyrics: 'lyrics', chords: [{ chord: { degree: 0, quality: '' }, index: 0 }] }
		]);
	});

	it('falls back to the sourceKey option when there is no {key:} directive', () => {
		const doc = parseChordPro('[C]no key directive here', { sourceKey: 'C' });
		expect(doc.sourceKey).toBe('C');
		expect(doc.sections[0].lines[0].chords[0].chord).toEqual({ degree: 0, quality: '' });
	});

	it('normalizes curly apostrophes in chordpro lyrics', () => {
		const doc = parseChordPro('{key: G}\n[G]I’ve been set free');
		expect(doc.sections[0].lines[0].lyrics).toBe("I've been set free");
	});
});

describe('chartDocToChordPro', () => {
	it('serializes title, key, and inline chords', () => {
		const doc: ChartDoc = {
			title: 'Amazing Grace',
			sourceKey: 'G',
			sections: [
				{
					label: undefined,
					lines: [
						{
							lyrics: 'Amazing grace',
							chords: [{ chord: { degree: 0, quality: '' }, index: 0 }]
						}
					]
				}
			]
		};
		const out = chartDocToChordPro(doc);
		expect(out).toContain('{title: Amazing Grace}');
		expect(out).toContain('{key: G}');
		expect(out).toContain('[G]Amazing grace');
	});

	it('serializes verse/chorus/bridge sections with start/end directives', () => {
		const doc: ChartDoc = {
			sourceKey: 'G',
			sections: [
				{ label: 'Verse 1', lines: [{ lyrics: 'a', chords: [] }] },
				{ label: 'Chorus', lines: [{ lyrics: 'b', chords: [] }] }
			]
		};
		const out = chartDocToChordPro(doc);
		expect(out).toContain('{start_of_verse: Verse 1}');
		expect(out).toContain('{end_of_verse}');
		expect(out).toContain('{start_of_chorus: Chorus}');
		expect(out).toContain('{end_of_chorus}');
	});

	it('falls back to a plain label line for non verse/chorus/bridge labels', () => {
		const doc: ChartDoc = {
			sourceKey: 'G',
			sections: [{ label: 'Intro', lines: [{ lyrics: 'a', chords: [] }] }]
		};
		const out = chartDocToChordPro(doc);
		expect(out.split('\n')).toContain('Intro');
	});
});

describe('ChartDoc <-> ChordPro round trip', () => {
	function roundTrip(doc: ChartDoc): ChartDoc {
		return parseChordPro(chartDocToChordPro(doc));
	}

	it('round-trips a doc produced from the plaintext parser losslessly', () => {
		const plaintext = `Verse1
             G
Amazing grace, how sweet the sound
           C          G/B
That saved a wretch like me
       Em               C            D
I once was lost, but now I’m found

Chorus
C                           G
  My chains are gone, I’ve been set free
C                           G       D
  My God, my Savior has ransomed me`;
		const original = parsePlaintextChart(plaintext, 'G', { title: 'Amazing Grace' });
		expect(roundTrip(original)).toEqual(original);
	});

	it('round-trips N.C. and raw-passthrough chords', () => {
		const doc: ChartDoc = {
			sourceKey: 'D',
			sections: [
				{
					label: 'Intro',
					lines: [
						{
							lyrics: 'hold here',
							chords: [
								{ chord: { degree: 0, quality: 'N.C.' }, index: 0 },
								{ chord: { degree: 0, quality: '', raw: 'D5(no3)' }, index: 5 }
							]
						}
					]
				}
			]
		};
		expect(roundTrip(doc)).toEqual(doc);
	});

	it('round-trips blank lines within a section', () => {
		const doc: ChartDoc = {
			sourceKey: 'C',
			sections: [
				{
					label: 'Bridge',
					lines: [
						{ lyrics: 'line one', chords: [{ chord: { degree: 0, quality: '' }, index: 0 }] },
						{ lyrics: '', chords: [] },
						{ lyrics: 'line two', chords: [] }
					]
				}
			]
		};
		expect(roundTrip(doc)).toEqual(doc);
	});

	it('round-trips a chart with no title', () => {
		const doc: ChartDoc = {
			sourceKey: 'A',
			sections: [{ label: undefined, lines: [{ lyrics: 'x', chords: [] }] }]
		};
		const result = roundTrip(doc);
		expect(result.title).toBeUndefined();
		expect(result).toEqual(doc);
	});
});
