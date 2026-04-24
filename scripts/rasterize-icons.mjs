#!/usr/bin/env node
// Regenerates PNG icons from static/icon.svg and static/icon-maskable.svg.
// Run with: pnpm dlx -p sharp@0.33.5 node scripts/rasterize-icons.mjs
// Commit the resulting PNGs; this script is not part of the build.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const staticDir = path.join(root, 'static');

const targets = [
	{ svg: 'icon.svg', out: 'icon-192.png', size: 192 },
	{ svg: 'icon.svg', out: 'icon-512.png', size: 512 },
	{ svg: 'icon.svg', out: 'apple-touch-icon.png', size: 180 },
	{ svg: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 }
];

for (const { svg, out, size } of targets) {
	const src = await readFile(path.join(staticDir, svg));
	const png = await sharp(src, { density: 384 }).resize(size, size).png().toBuffer();
	await writeFile(path.join(staticDir, out), png);
	console.log(`wrote static/${out} (${size}×${size}, ${png.length} bytes)`);
}
