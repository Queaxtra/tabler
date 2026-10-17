import type { FileKind } from './types.js';

export interface FileTypeRule {
	kind: FileKind;
	label: string;
	extensions: string[];
}

// every extension the engine can ingest, sqlite aliases included
export const FILE_TYPES: FileTypeRule[] = [
	{ kind: 'sqlite', label: 'SQLite', extensions: ['sqlite', 'sqlite3', 'db'] },
	{ kind: 'parquet', label: 'Parquet', extensions: ['parquet'] },
	{ kind: 'csv', label: 'CSV', extensions: ['csv'] },
	{ kind: 'tsv', label: 'TSV', extensions: ['tsv'] },
	{ kind: 'json', label: 'JSON', extensions: ['json', 'ndjson', 'jsonl'] }
];

export const ACCEPT_ATTRIBUTE = FILE_TYPES.flatMap((rule) =>
	rule.extensions.map((extension) => `.${extension}`)
).join(',');

export const FILE_LABELS = FILE_TYPES.map((rule) => rule.label);

export function fileKind(name: string): FileKind | null {
	const extension = name.split('.').pop()?.toLowerCase() ?? '';
	const rule = FILE_TYPES.find((candidate) => candidate.extensions.includes(extension));
	return rule ? rule.kind : null;
}
