/**
 * Shared type contracts for the grabber library (docs/PLAN-v0.1.md task B4).
 *
 * The grabber is a LIBRARY ONLY — no routes/UI. It takes a URL or raw HTML,
 * extracts a chart via a site adapter, parses it with `src/lib/chart`, and
 * hands back a `GrabResult` ready to preview/save (task C1 wires this into
 * the add-song page).
 */

import type { KeyName } from '$lib/theory/types';

/** What a site adapter pulls out of a page's raw HTML, before chart parsing. */
export interface AdapterExtract {
	title?: string;
	artist?: string;
	/** The raw "chords above lyrics" (or ChordPro) chart text, unparsed. */
	chartText: string;
}

/**
 * A site adapter: matches one or more domains and knows how to pull the
 * chart text (and whatever metadata it can) out of that site's HTML.
 * Adapters are pure functions — no fetching, no side effects — so they're
 * trivially unit-testable against fixture HTML.
 */
export interface SiteAdapter {
	/** Domains this adapter handles, e.g. ["pnwchords.com"]. Matched exactly or as a subdomain (task registry.ts). */
	domains: string[];
	/** Return null if the page doesn't look like a chart page this adapter can handle. */
	extract(html: string, url: string): AdapterExtract | null;
}

/** The fully assembled result of a successful grab, ready to preview/save. */
export interface GrabResult {
	title?: string;
	artist?: string;
	/** The raw chart text as extracted from the page (before chart parsing). */
	chartText: string;
	/** The key the chart's chord letters are literally written in (ChartDoc.sourceKey). */
	sourceKey?: KeyName;
	header: {
		soundingKey?: KeyName;
		shapeKey?: KeyName;
		capo?: number;
	};
	sourceUrl: string;
	sourceSite: string;
	/** ISO timestamp of when the grab happened. */
	fetchedAt: string;
}
