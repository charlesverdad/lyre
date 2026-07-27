/**
 * Comma-separated authors <-> string[] mapping for the add/edit metadata
 * form (mvp-spec.md F2: "authors" is a plain text field, stored as a list).
 */

/** Parse a comma-separated authors input into a trimmed, non-empty list. */
export function parseAuthorsInput(value: string): string[] {
	return value
		.split(',')
		.map((author) => author.trim())
		.filter((author) => author.length > 0);
}

/** Render an authors list back into the comma-separated form field value. */
export function formatAuthorsInput(authors: string[]): string {
	return authors.join(', ');
}
