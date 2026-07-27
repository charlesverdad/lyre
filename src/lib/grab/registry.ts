/**
 * Domain -> adapter lookup (docs/PLAN-v0.1.md task B4).
 *
 * Deliberately no Ultimate Guitar adapter: docs/licensing-and-content.md
 * item 4 — "UG's ToS and commercial licensing make it a poor grab target;
 * no UG adapter ships in the official repo." We go further than "just don't
 * write one": UG domains are explicitly excluded from even the generic
 * best-effort adapter, so a UG URL never accidentally gets scraped by the
 * fallback path. Those users get routed to the paste flow instead.
 */

import { pnwchordsAdapter } from './adapters/pnwchords';
import { genericAdapter } from './adapters/generic';
import type { SiteAdapter } from './types';

/** Domains that must never be grabbed, by any adapter (see module doc). */
const EXCLUDED_DOMAINS = new Set(['ultimate-guitar.com', 'tabs.ultimate-guitar.com']);

const ADAPTERS: SiteAdapter[] = [pnwchordsAdapter];

/** Error shape for a domain the registry refuses to grab (policy, not a bug). */
export interface UnsupportedSiteError {
	reason: 'unsupported-site';
	message: string;
}

export type RegistryLookup =
	| { kind: 'adapter'; adapter: SiteAdapter }
	| { kind: 'generic'; adapter: SiteAdapter }
	| { kind: 'excluded'; error: UnsupportedSiteError };

function hostnameOf(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return null;
	}
}

/** `host` matches `domain` exactly, or is a subdomain of it (e.g. "www.pnwchords.com" matches "pnwchords.com"). */
function domainMatches(host: string, domain: string): boolean {
	return host === domain || host.endsWith(`.${domain}`);
}

function isExcluded(host: string): boolean {
	for (const domain of EXCLUDED_DOMAINS) {
		if (domainMatches(host, domain)) return true;
	}
	return false;
}

/**
 * Resolve the adapter to use for `url`: an exact/subdomain-matched adapter,
 * the generic fallback for anything else, or an `excluded` result for
 * policy-excluded domains (Ultimate Guitar) — never a generic-adapter
 * attempt against those.
 */
export function resolveAdapter(url: string): RegistryLookup {
	const host = hostnameOf(url);
	if (host && isExcluded(host)) {
		return {
			kind: 'excluded',
			error: {
				reason: 'unsupported-site',
				message:
					'Ultimate Guitar is not supported for grabbing (licensing policy). Copy the chart text and use "Paste" instead.'
			}
		};
	}

	if (host) {
		for (const adapter of ADAPTERS) {
			if (adapter.domains.some((domain) => domainMatches(host, domain))) {
				return { kind: 'adapter', adapter };
			}
		}
	}

	return { kind: 'generic', adapter: genericAdapter };
}
