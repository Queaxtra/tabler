export function quoteIdentifier(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}

export function quoteLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

// turn arbitrary text into a valid bare identifier
export function sanitizeName(value: string): string {
	const cleaned = value.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
	if (!cleaned) return 'data';
	return /^[0-9]/.test(cleaned) ? `t_${cleaned}` : cleaned;
}

// derive a safe table name from a file name
export function toObjectName(fileName: string): string {
	return sanitizeName(fileName.replace(/\.[^.]+$/, ''));
}

export function uniqueName(base: string, taken: Set<string>): string {
	if (!taken.has(base)) {
		taken.add(base);
		return base;
	}

	let suffix = 2;
	while (taken.has(`${base}_${suffix}`)) suffix += 1;

	const name = `${base}_${suffix}`;
	taken.add(name);
	return name;
}

// the row search runs over the whole query, so a trailing LIMIT must not narrow its scope
// ponytail: heuristic single trailing LIMIT/OFFSET strip, good enough for editor-written select queries
export function stripTrailingLimit(sql: string): string {
	return sql
		.replace(/;\s*$/, '')
		.replace(/\s+limit\s+\d+(\s+offset\s+\d+)?\s*$/i, '')
		.trim();
}
