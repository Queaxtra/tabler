import type { CellValue } from './types.js';

const DAY_MS = 86_400_000;

// convert an arrow cell into a display string, null means sql null
export function formatCell(value: unknown, type: string): CellValue {
	if (value === null || value === undefined) return null;
	if (typeof value === 'bigint') return formatBigInt(value, type);
	if (value instanceof Date) return formatDate(value);
	if (typeof value === 'number') return formatNumber(value, type);
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'string') return value;
	if (value instanceof Uint8Array) return formatBytes(value);
	return safeStringify(value);
}

function formatBigInt(value: bigint, type: string): CellValue {
	if (type.toUpperCase().includes('TIMESTAMP')) {
		return formatDate(new Date(Number(value / 1000n)));
	}
	return value.toString();
}

function formatNumber(value: number, type: string): CellValue {
	// arrow date32 values arrive as days since the epoch
	if (type.toUpperCase() === 'DATE') {
		return (formatDate(new Date(value * DAY_MS)) ?? '').slice(0, 10);
	}
	return String(value);
}

function formatDate(value: Date): CellValue {
	if (Number.isNaN(value.getTime())) return null;
	return value.toISOString().slice(0, 19).replace('T', ' ');
}

function formatBytes(value: Uint8Array): CellValue {
	const preview = Array.from(value.slice(0, 8))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join(' ');
	return `0x${preview}${value.length > 8 ? ' ...' : ''}`;
}

function safeStringify(value: unknown): CellValue {
	try {
		return JSON.stringify(value, jsonReplacer, 2);
	} catch {
		return String(value);
	}
}

// arrow nests bigints and maps inside struct/list columns, both break plain json.stringify
function jsonReplacer(_key: string, value: unknown): unknown {
	if (typeof value === 'bigint') return value.toString();
	if (value instanceof Map) {
		return Object.fromEntries(Array.from(value, ([key, item]) => [String(key), item]));
	}
	return value;
}
