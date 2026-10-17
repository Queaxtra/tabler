// standalone self check for the translations, run with: bun src/lib/i18n/index.check.ts
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '../translations/en.json' with { type: 'json' };
import tr from '../translations/tr.json' with { type: 'json' };

const SOURCE_ROOT = new URL('../../', import.meta.url).pathname;

// every leaf path of a dictionary, so the two locales can be compared
function leafPaths(node: unknown, prefix = ''): string[] {
	if (typeof node === 'string') return [prefix];
	if (typeof node !== 'object' || node === null) return [];
	return Object.entries(node).flatMap(([key, value]) =>
		leafPaths(value, prefix === '' ? key : `${prefix}.${key}`)
	);
}

function nodeAt(node: unknown, path: string): unknown {
	let current: unknown = node;
	for (const part of path.split('.')) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function sourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const path = join(directory, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(svelte|ts)$/.test(path) && !path.endsWith('.check.ts') ? [path] : [];
	});
}

// same shape in both locales, otherwise a key renders untranslated in one of them
assert.deepEqual(
	leafPaths(en).sort(),
	leafPaths(tr).sort(),
	'en.json and tr.json must expose the same keys'
);

// every key the app asks for resolves, missing keys would leak raw key names into the ui
const STATIC_KEY = /(?:\$t|translate)\(\s*'([^']+)'/g;
const DYNAMIC_KEY = /(?:\$t|translate)\(\s*`([^`$]*)\$\{/g;
const missing: string[] = [];
let checked = 0;

for (const file of sourceFiles(SOURCE_ROOT)) {
	const source = readFileSync(file, 'utf8');

	for (const [, key] of source.matchAll(STATIC_KEY)) {
		checked += 1;
		if (typeof nodeAt(en, key) !== 'string') missing.push(`${file}: ${key}`);
	}

	// dynamic keys use a literal prefix, the prefix must resolve to an object holding the values
	for (const [, prefix] of source.matchAll(DYNAMIC_KEY)) {
		if (prefix === '') continue;
		checked += 1;
		const node = nodeAt(en, prefix.replace(/\.$/, ''));
		if (typeof node !== 'object' || node === null) missing.push(`${file}: ${prefix}*`);
	}
}

assert.deepEqual(missing, [], `unknown translation keys:\n${missing.join('\n')}`);

console.log(`i18n ok: ${leafPaths(en).length} keys x 2 locales, ${checked} lookups checked`);
