import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { quoteIdentifier, quoteLiteral, sanitizeName, uniqueName } from './sql.js';
import type { SourceFile } from '#lib/files/types.js';

type SqliteRuntime = Awaited<ReturnType<typeof initSqlJs>>;
type SqliteDatabase = InstanceType<SqliteRuntime['Database']>;
type SqliteValue = number | string | Uint8Array | null;

interface SqliteTable {
	name: string;
	columns: string[];
	rows: SqliteValue[][];
}

let runtime: Promise<SqliteRuntime> | null = null;
let bufferSequence = 0;

// duckdb-wasm cannot open browser-registered sqlite files (the wasm file-system VFS is still
// incomplete upstream), so read the database with sql.js and materialise each table into duckdb
// to keep a single query surface
export async function loadSqliteDatabase(
	db: AsyncDuckDB,
	connection: AsyncDuckDBConnection,
	source: SourceFile,
	taken: Set<string>
): Promise<string[]> {
	const SQL = await loadRuntime();
	const bytes = new Uint8Array(await source.file.arrayBuffer());
	const sqlite = new SQL.Database(bytes);
	const created: string[] = [];

	try {
		for (const table of readTables(sqlite)) {
			const name = uniqueName(sanitizeName(table.name), taken);
			await materialize(db, connection, table, name);
			created.push(name);
		}
	} finally {
		sqlite.close();
	}

	return created;
}

function loadRuntime(): Promise<SqliteRuntime> {
	runtime ??= initSqlJs({ locateFile: () => wasmUrl });
	return runtime;
}

function readTables(sqlite: SqliteDatabase): SqliteTable[] {
	const names = queryColumn(
		sqlite,
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
		'name'
	);

	return names.map((name) => ({
		name,
		columns: queryColumn(sqlite, `PRAGMA table_info(${quoteIdentifier(name)})`, 'name'),
		rows: selectAll(sqlite, name)
	}));
}

async function materialize(
	db: AsyncDuckDB,
	connection: AsyncDuckDBConnection,
	table: SqliteTable,
	name: string
): Promise<void> {
	const target = quoteIdentifier(name);

	if (table.rows.length === 0) {
		// ponytail: an empty sqlite table carries no values to infer from, so every column becomes varchar
		const definition = table.columns
			.map((column) => `${quoteIdentifier(column)} VARCHAR`)
			.join(', ');
		await connection.query(`CREATE OR REPLACE TABLE ${target} (${definition || 'value VARCHAR'})`);
		return;
	}

	const payload = new TextEncoder().encode(JSON.stringify(toRecords(table)));
	const bufferName = `sqlite_import_${(bufferSequence += 1)}.json`;
	await db.registerFileBuffer(bufferName, payload);
	await connection.query(
		`CREATE OR REPLACE TABLE ${target} AS SELECT * FROM read_json_auto(${quoteLiteral(bufferName)})`
	);
	// release the temporary buffer so repeated imports do not pile up in memory
	await db.dropFile(bufferName);
}

function toRecords(table: SqliteTable): Record<string, unknown>[] {
	return table.rows.map((row) => {
		const record: Record<string, unknown> = {};
		table.columns.forEach((column, index) => {
			record[column] = toJsonValue(row[index]);
		});
		return record;
	});
}

function toJsonValue(value: SqliteValue): unknown {
	// blobs have no json representation, surface them as hex text
	return value instanceof Uint8Array ? toHex(value) : value;
}

function toHex(bytes: Uint8Array): string {
	let out = '0x';
	for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
	return out;
}

function queryColumn(sqlite: SqliteDatabase, sql: string, column: string): string[] {
	const result = sqlite.exec(sql);
	if (result.length === 0) return [];

	const index = result[0].columns.indexOf(column);
	if (index < 0) return [];
	return result[0].values.map((row) => String(row[index]));
}

function selectAll(sqlite: SqliteDatabase, table: string): SqliteValue[][] {
	const result = sqlite.exec(`SELECT * FROM ${quoteIdentifier(table)}`);
	return result.length > 0 ? result[0].values : [];
}
