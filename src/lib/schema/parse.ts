import type { ColumnSchema, QueryResult, TableRef } from '#lib/db/types.js';

// schema parsing stays pure, it only reads a query result so it never touches the wasm engine
function columnIndex(result: QueryResult, name: string): number {
	return result.columns.findIndex((column) => column.name.toLowerCase() === name);
}

export function parseTables(result: QueryResult): TableRef[] {
	const databaseIndex = columnIndex(result, 'database_name');
	const schemaIndex = columnIndex(result, 'schema_name');
	const tableIndex = columnIndex(result, 'table_name');
	if (tableIndex < 0) return [];

	return result.rows
		.map((row) => {
			const database = databaseIndex >= 0 ? String(row[databaseIndex] ?? '') : '';
			const schema = schemaIndex >= 0 ? String(row[schemaIndex] ?? '') : '';
			const name = String(row[tableIndex] ?? '');
			return { database, schema, name, qualified: qualify(database, schema, name) };
		})
		.filter((ref) => ref.name.length > 0);
}

export function parseColumns(result: QueryResult): ColumnSchema[] {
	const nameIndex = columnIndex(result, 'column_name');
	const typeIndex = columnIndex(result, 'column_type');
	const nullIndex = columnIndex(result, 'null');
	if (nameIndex < 0) return [];

	return result.rows.map((row) => ({
		name: String(row[nameIndex] ?? ''),
		type: typeIndex >= 0 ? String(row[typeIndex] ?? '') : '',
		nullable: nullIndex >= 0 ? String(row[nullIndex] ?? '').toUpperCase() === 'YES' : true
	}));
}

export function qualify(database: string, schema: string, name: string): string {
	return [database, schema, name].filter(Boolean).map(quote).join('.');
}

function quote(value: string): string {
	return `"${value.replace(/"/g, '""')}"`;
}
