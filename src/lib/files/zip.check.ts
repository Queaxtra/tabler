// standalone self check for the zip codec, run with: bun src/lib/files/zip.check.ts
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZip, readZip } from './zip.js';
import type { ZipEntry } from './zip.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function find(entries: ZipEntry[], name: string): ZipEntry {
	const entry = entries.find((candidate) => candidate.name === name);
	assert.ok(entry, `missing entry ${name}`);
	return entry;
}

// stored round trip, covering binary payloads and a non ascii name
{
	const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
	const zip = createZip([
		{ name: 'manifest.json', data: encoder.encode('{"version":1}') },
		{ name: 'tables/1.parquet', data: bytes },
		{ name: 'veri/ürün.txt', data: encoder.encode('merhaba') }
	]);

	const entries = await readZip(zip);
	assert.equal(entries.length, 3);
	assert.equal(decoder.decode(find(entries, 'manifest.json').data), '{"version":1}');
	assert.deepEqual([...find(entries, 'tables/1.parquet').data], [...bytes]);
	assert.equal(decoder.decode(find(entries, 'veri/ürün.txt').data), 'merhaba');
}

// interoperability with a deflated archive written by a desktop tool
{
	const dir = mkdtempSync(join(tmpdir(), 'tabler-zip-'));
	try {
		writeFileSync(join(dir, 'note.txt'), 'deflate me');
		execFileSync('zip', ['-q', 'archive.zip', 'note.txt'], { cwd: dir });

		const entries = await readZip(new Uint8Array(readFileSync(join(dir, 'archive.zip'))));
		assert.equal(decoder.decode(find(entries, 'note.txt').data), 'deflate me');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

console.log('zip ok');
