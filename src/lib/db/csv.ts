function escapeField(value: string | null): string {
	if (value === null) return '';
	return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// ponytail: export walks the rows already in memory, streaming is not needed at this size
export function toCsv(columns: string[], rows: readonly (string | null)[][]): string {
	const lines = [columns.map(escapeField).join(',')];
	for (const row of rows) lines.push(row.map(escapeField).join(','));
	return lines.join('\n');
}
