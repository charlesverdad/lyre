import { describe, expect, it } from 'vitest';
import { renderChord } from '../theory/chords';
import { detectFormat, inferSourceKeyFromChords, parseChart } from './detect';

const PNWCHORDS_STYLE = `Original in Ab. Capo 1, play in G.
Verse1
             G
Amazing grace, how sweet the sound
           C          G/B
That saved a wretch like me
       Em               C            D
I once was lost, but now I’m found
                       Em       C
Was blind, but now I see

Chorus
C                           G
  My chains are gone, I’ve been set free
C                           G       D
  My God, my Savior has ransomed me
C                              G  D  Em
  And like a flood, His mercy reigns
         C          D           G
Unending love, amazing grace

Verse2
             G
The Lord has promised good to me
           C                  G
His word my hope secures
       Em             C             D
He will my shield and portion be
                     Em    C
As long as life endures`;

describe('detectFormat', () => {
	it('detects plaintext chord-over-lyrics charts', () => {
		expect(detectFormat(PNWCHORDS_STYLE)).toBe('plaintext');
	});

	it('detects ChordPro via directives', () => {
		expect(detectFormat('{title: Test}\n{key: G}\nplain lyrics no brackets')).toBe('chordpro');
	});

	it('detects ChordPro via inline bracket chords alone', () => {
		expect(detectFormat('[G]Amazing [C]grace')).toBe('chordpro');
	});

	it('does not misdetect a plaintext chord line as chordpro', () => {
		expect(detectFormat('G   C   D   Em\nAmazing grace, how sweet the sound')).toBe('plaintext');
	});
});

describe('parseChart — acceptance path: pnwchords header vs. chord-letter key', () => {
	it('distinguishes doc.sourceKey (the key chords are literally written in) from the pattern header', () => {
		const { doc, header } = parseChart(PNWCHORDS_STYLE);

		// The header states the *pattern*: sounding key Ab, played with G
		// shapes, capo 1.
		expect(header.soundingKey).toBe('Ab');
		expect(header.shapeKey).toBe('G');
		expect(header.capo).toBe(1);

		// But the chart's chord letters ("G", "C", "Em", "D", "G/B", …) are
		// literally G-family shapes — so the stored, key-neutral ChartDoc must
		// be relative to G, NOT Ab. Getting this backwards would make every
		// rendered transposition wrong.
		expect(doc.sourceKey).toBe('G');
	});

	it('parses sections and chords correctly from the full pnwchords-style text', () => {
		const { doc } = parseChart(PNWCHORDS_STYLE);
		expect(doc.sections.map((s) => s.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2']);

		const firstLine = doc.sections[0].lines[0];
		expect(firstLine.lyrics).toBe('Amazing grace, how sweet the sound');
		expect(firstLine.chords).toEqual([{ chord: { degree: 0, quality: '' }, index: 13 }]);

		// G/B slash chord, degree 5 relative to G is C, bass degree 4 is B.
		const secondLine = doc.sections[0].lines[1];
		expect(secondLine.chords[1].chord).toEqual({ degree: 0, quality: '', bassDegree: 4 });
	});

	it('normalizes curly apostrophes throughout', () => {
		const { doc } = parseChart(PNWCHORDS_STYLE);
		const allLyrics = doc.sections.flatMap((s) => s.lines.map((l) => l.lyrics)).join(' ');
		expect(allLyrics).not.toMatch(/[’‘]/);
		expect(allLyrics).toContain("I've");
	});
});

describe('parseChart — ChordPro input', () => {
	it('parses a ChordPro chart and reports header derived from {key:}', () => {
		const text = '{title: Doxology}\n{key: G}\n[G]Praise God from [C]whom all blessings [G]flow';
		const { doc, header } = parseChart(text);
		expect(doc.title).toBe('Doxology');
		expect(doc.sourceKey).toBe('G');
		expect(header.soundingKey).toBe('G');
		expect(header.shapeKey).toBe('G');
		expect(header.capo).toBe(0);
	});
});

describe('inferSourceKeyFromChords', () => {
	it('prefers the last chord when it is a plain major triad (songs resolve to their tonic)', () => {
		// last chord D is major -> D, even though the progression opens on G.
		expect(inferSourceKeyFromChords('G   C   D\nlyrics')).toBe('D');
	});

	it('falls back to the first chord when the last chord is not a plain major triad', () => {
		// last chord Em is minor -> fall back to the first chord's root, G.
		expect(inferSourceKeyFromChords('G   C   Em\nlyrics')).toBe('G');
	});

	it('returns undefined when the text has no recognizable chords', () => {
		expect(inferSourceKeyFromChords('just some lyrics, no chords at all')).toBeUndefined();
	});
});

describe('parseChart — plain text without a header', () => {
	it("infers sourceKey from the chart's chords when no header states a key", () => {
		// No header; chord letters are G/C/D/G — a typical I-IV-V-I progression
		// that opens AND closes on the tonic G, so both the "last major chord"
		// and "first chord" heuristic branches agree on G.
		const { doc, header } = parseChart('G   C   D   G\nAmazing grace, how sweet the sound');
		expect(doc.sourceKey).toBe('G');
		expect(header.soundingKey).toBeUndefined();
	});

	it('renders the inferred-key chart back in that same shape key as a no-op', () => {
		const { doc } = parseChart('G   C   D   G\nAmazing grace, how sweet the sound');
		expect(doc.sourceKey).toBe('G');
		const rendered = doc.sections[0].lines[0].chords.map((c) =>
			renderChord(c.chord, doc.sourceKey)
		);
		expect(rendered).toEqual(['G', 'C', 'D', 'G']);
	});

	it('falls back to key "C" only when there are no chords at all to infer from', () => {
		const { doc, header } = parseChart('Just a lyric line with no chords anywhere in it');
		expect(doc.sourceKey).toBe('C');
		expect(header.soundingKey).toBeUndefined();
	});
});
