/**
 * Form-values <-> record mapping for the add/edit screens (mvp-spec.md F2).
 * Pure functions only — no DB access — so they're unit-testable without
 * Dexie/fake-indexeddb.
 */

import { chartDocToChordPro } from '$lib/chart';
import type { ChartDoc, ChartRecord, KeyName, Pattern, SongRecord } from '$lib/theory/types';
import type { CreateSongInput } from '$lib/db/repo';
import { parseAuthorsInput } from './authors';

/** Everything the metadata form (title/authors/key/tempo/CCLI) collects. */
export interface MetadataFormValues {
	title: string;
	/** Comma-separated, as typed. Use `parseAuthorsInput` to get the list. */
	authorsInput: string;
	sourceKey: KeyName;
	/** As typed; blank means "no tempo entered". */
	tempoInput: string;
	ccliNumber: string;
}

export function emptyMetadataForm(defaultKey: KeyName = 'C'): MetadataFormValues {
	return { title: '', authorsInput: '', sourceKey: defaultKey, tempoInput: '', ccliNumber: '' };
}

/** Parse the tempo text field into a `tempoBpm` number, or `undefined` if blank/invalid. */
export function parseTempoInput(value: string): number | undefined {
	const trimmed = value.trim();
	if (trimmed === '') return undefined;
	const n = Number(trimmed);
	return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/**
 * Build a `repo.createSong` input from the add flow's form + parsed chart.
 * Paste-flow charts have no grab provenance (mvp-spec.md F2: `rawGrabbedText`
 * / `sourceAttribution` are for the grab flow, task B4) — so those, along
 * with `sourceUrl`/`sourceSite`/`fetchedAt`, are always left unset here.
 */
export function buildCreateSongInput(
	form: MetadataFormValues,
	doc: ChartDoc,
	initialPattern?: Pattern
): CreateSongInput {
	const authors = parseAuthorsInput(form.authorsInput);
	const ccliNumber = form.ccliNumber.trim();

	return {
		song: {
			title: form.title.trim(),
			aliases: [],
			authors,
			ccliNumber: ccliNumber || undefined,
			defaultKey: form.sourceKey,
			tempoBpm: parseTempoInput(form.tempoInput),
			topics: []
		},
		chart: {
			name: 'Default',
			chordproSource: chartDocToChordPro(doc),
			sourceKey: doc.sourceKey
		},
		pattern: initialPattern
			? {
					label: 'My usual',
					soundingKey: initialPattern.soundingKey,
					shapeKey: initialPattern.shapeKey,
					capo: initialPattern.capo
				}
			: undefined
	};
}

/** Build a `repo.updateSong` patch from the edit flow's form. */
export function buildSongUpdatePatch(
	form: MetadataFormValues
): Partial<Omit<SongRecord, 'id' | 'createdAt'>> {
	const ccliNumber = form.ccliNumber.trim();
	return {
		title: form.title.trim(),
		authors: parseAuthorsInput(form.authorsInput),
		ccliNumber: ccliNumber || undefined,
		defaultKey: form.sourceKey,
		tempoBpm: parseTempoInput(form.tempoInput)
	};
}

/** Build a `repo.updateChart` patch from the edit flow's current doc. */
export function buildChartUpdatePatch(
	doc: ChartDoc
): Partial<Omit<ChartRecord, 'id' | 'songId' | 'createdAt'>> {
	return {
		chordproSource: chartDocToChordPro(doc),
		sourceKey: doc.sourceKey
	};
}

/** Seed the metadata form from an existing song + chart (edit flow). */
export function metadataFormFromRecords(song: SongRecord, chart: ChartRecord): MetadataFormValues {
	return {
		title: song.title,
		authorsInput: song.authors.join(', '),
		sourceKey: chart.sourceKey,
		tempoInput: song.tempoBpm !== undefined ? String(song.tempoBpm) : '',
		ccliNumber: song.ccliNumber ?? ''
	};
}
