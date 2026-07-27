// One-off icon generator (task C1, PWA manifest icons). Rasterizes
// `static/icons/icon-source.svg` (a plain black rounded square with a white
// serif "L", per docs/design.md's mono palette) to the PNG sizes the
// manifest and `<link rel="apple-touch-icon">` need. Re-run with
// `pnpm run icons` whenever `icon-source.svg` changes — the PNGs are
// committed output, not generated at build time.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const iconsDir = new URL('../static/icons/', import.meta.url);
const svg = await readFile(new URL('icon-source.svg', iconsDir));

const targets = [
	{ file: 'icon-192.png', size: 192 },
	{ file: 'icon-512.png', size: 512 },
	{ file: 'apple-touch-icon.png', size: 180 }
];

for (const { file, size } of targets) {
	const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
	await writeFile(new URL(file, iconsDir), png);
	console.log(`wrote ${file} (${size}x${size}) -> ${fileURLToPath(new URL(file, iconsDir))}`);
}
