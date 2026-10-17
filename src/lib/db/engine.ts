import * as duckdb from '@duckdb/duckdb-wasm';
import * as XLSX from 'xlsx';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { formatCell } from './format.js';
import { instantiateDatabase } from './duckdb.js';
import { loadSqliteDatabase } from './sqlite.js';
import {
	quoteIdentifier,
	quoteLiteral,
	stripTrailingLimit,
	toObjectName,
	uniqueName
} from './sql.js';
import { parseColumns, parseTables } from '#lib/schema/parse.js';
import { createZip, readZip, type ZipEntry } from '#lib/files/zip.js';
import { translate } from '../i18n/index.js';
import type {
	CellValue,
	EditableTable,
	EditPayload,
	ExportFile,
	ExportFormatKey,
	QueryResult,
	QueryView,
	SessionManifest,
	TableSchema
} from './types.js';
import type { FileKind, SourceFile } from '#lib/files/types.js';
import { SvelteSet } from 'svelte/reactivity';

// cap conversion work so huge result sets stay responsive in the browser
const MAX_DISPLAY_ROWS = 2000;

// bump when the session archive layout changes in a breaking way
const SESSION_VERSION = 1;
const MANIFEST_FILE = 'manifest.json';

interface ExportFormat {
	extension: string;
	mime: string;
	options: string;
}

// one export recipe per source format, sqlite falls back to csv because wasm cannot write the file
const EXPORT_FORMATS: Record<FileKind, ExportFormat> = {
	csv: { extension: 'csv', mime: 'text/csv', options: "(FORMAT CSV, HEADER, DELIMITER ',')" },
	tsv: {
		extension: 'tsv',
		mime: 'text/tab-separated-values',
		options: "(FORMAT CSV, HEADER, DELIMITER '\t')"
	},
	json: { extension: 'json', mime: 'application/json', options: '(FORMAT JSON, ARRAY true)' },
	parquet: {
		extension: 'parquet',
		mime: 'application/octet-stream',
		options: '(FORMAT PARQUET, COMPRESSION zstd)'
	},
	sqlite: { extension: 'csv', mime: 'text/csv', options: "(FORMAT CSV, HEADER, DELIMITER ',')" },
	xlsx: {
		extension: 'xlsx',
		mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		options: '(FORMAT xlsx, HEADER true)'
	},
	xls: { extension: 'csv', mime: 'text/csv', options: "(FORMAT CSV, HEADER, DELIMITER ',')" }
};

// formats offered when exporting a query result, spreadsheet needs the excel extension at runtime
const QUERY_EXPORT_FORMATS: Record<ExportFormatKey, ExportFormat> = {
	csv: { extension: 'csv', mime: 'text/csv', options: "(FORMAT CSV, HEADER, DELIMITER ',')" },
	json: { extension: 'json', mime: 'application/json', options: '(FORMAT JSON, ARRAY true)' },
	parquet: {
		extension: 'parquet',
		mime: 'application/octet-stream',
		options: '(FORMAT PARQUET, COMPRESSION zstd)'
	},
	xlsx: {
		extension: 'xlsx',
		mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		options: '(FORMAT xlsx, HEADER true)'
	}
};

// a value becomes NULL when cleared, otherwise it is cast to the column type when that type is simple
function toSqlLiteral(value: CellValue, type: string | undefined): string {
	if (value === null || value === '') return 'NULL';

	const text = quoteLiteral(value);
	const complex = !type || /[[(<]/.test(type);
	return complex ? text : `CAST(${text} AS ${type})`;
}

// ponytail: the excel extension returns its spreadsheet one byte off in duckdb-wasm, so the zip signature
// sits behind junk that excel and unzip reject; drop it and drop this helper once the extension is fixed
function trimZipPrefix(buffer: Uint8Array): Uint8Array {
	for (let index = 0; index < 8; index += 1) {
		if (
			buffer[index] === 0x50 &&
			buffer[index + 1] === 0x4b &&
			buffer[index + 2] === 0x03 &&
			buffer[index + 3] === 0x04
		) {
			return buffer.subarray(index);
		}
	}
	return buffer;
}

function exportBlob(format: ExportFormat, buffer: Uint8Array): Blob {
	const bytes = format.extension === 'xlsx' ? trimZipPrefix(buffer) : buffer;
	return new Blob([bytes as BlobPart], { type: format.mime });
}

export class QueryEngine {
	private db: AsyncDuckDB | null = null;
	private connection: AsyncDuckDBConnection | null = null;
	private readonly tableNames = new SvelteSet<string>();
	private exportSequence = 0;

	async initialize(): Promise<void> {
		if (this.connection) return;

		const db = await instantiateDatabase();
		this.db = db;
		this.connection = await db.connect();
		await this.syncTableNames();
	}

	// returns the tables created from the source, so callers can map files to tables
	async load(source: SourceFile): Promise<string[]> {
		const db = this.requireDb();
		const connection = this.requireConnection();

		if (source.kind === 'sqlite') {
			return loadSqliteDatabase(db, connection, source, this.tableNames);
		}

		if (source.kind === 'xls') {
			const buffer = await source.file.arrayBuffer();
			const workbook = XLSX.read(buffer, { type: 'array' });
			const sheet = workbook.Sheets[workbook.SheetNames[0]];
			const csv = XLSX.utils.sheet_to_csv(sheet);
			const file = new File([csv], source.name.replace(/\.xls$/i, '.csv'), { type: 'text/csv' });
			const converted: SourceFile = { ...source, kind: 'csv', name: file.name, file };
			return this.load(converted);
		}

		if (source.kind === 'xlsx') {
			await connection.query('INSTALL excel; LOAD excel;');
		}

		const path = await this.registerFile(db, source);
		const name = uniqueName(toObjectName(source.name), this.tableNames);
		await connection.query(
			`CREATE OR REPLACE TABLE ${quoteIdentifier(name)} AS SELECT * FROM ${this.readerExpression(source, path)}`
		);
		return [name];
	}

	async run(sql: string): Promise<QueryResult> {
		return this.queryOn(this.requireConnection(), sql);
	}

	// applies search, per-column filters and sorting in duckdb, so it covers every row of the query
	// rather than the rows that happen to be loaded into the grid
	async refine(sql: string, view: QueryView, columns: string[]): Promise<QueryResult> {
		const connection = this.requireConnection();
		const base = stripTrailingLimit(sql);
		const conditions: string[] = [];

		const search = view.search.trim().toLowerCase();
		if (search && columns.length > 0) {
			const needle = quoteLiteral(search);
			const matches = columns.map(
				(name) => `contains(lower(CAST(${quoteIdentifier(name)} AS VARCHAR)), ${needle})`
			);
			conditions.push(`(${matches.join(' OR ')})`);
		}

		for (const filter of view.filters) {
			const term = filter.term.trim().toLowerCase();
			if (!term) continue;
			conditions.push(
				`contains(lower(CAST(${quoteIdentifier(filter.column)} AS VARCHAR)), ${quoteLiteral(term)})`
			);
		}

		const order = view.sorts
			.map((sort) => `${quoteIdentifier(sort.column)} ${sort.desc ? 'DESC' : 'ASC'}`)
			.join(', ');

		const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
		const orderBy = order ? ` ORDER BY ${order}` : '';

		return this.queryOn(connection, `SELECT * FROM (${base}) AS rows${where}${orderBy}`);
	}

	// per-column summary computed by duckdb, one row per column with type, range, nulls and quantiles
	async summarize(sql: string): Promise<QueryResult> {
		const connection = this.requireConnection();
		return this.queryOn(connection, `SUMMARIZE SELECT * FROM (${stripTrailingLimit(sql)}) AS rows`);
	}

	// load a base table for editing, each row carries its duckdb rowid as a stable key
	async openTable(qualified: string): Promise<EditableTable> {
		const connection = this.requireConnection();
		const schema = parseColumns(await this.queryOn(connection, `DESCRIBE ${qualified}`));
		const columns = schema.map((column) => column.name);
		const types = schema.map((column) => column.type);

		const projection = ['rowid AS "__rowid__"', ...columns.map(quoteIdentifier)].join(', ');
		const result = await this.queryOn(
			connection,
			`SELECT ${projection} FROM ${qualified} LIMIT ${MAX_DISPLAY_ROWS}`
		);

		const rows = result.rows.map((row) => ({
			key: String(row[0] ?? ''),
			values: row.slice(1),
			isNew: false
		}));

		const total = await this.countRows(connection, qualified);
		return {
			table: qualified,
			columns,
			types,
			rows,
			rowCount: total ?? rows.length,
			truncated: total !== null && total > rows.length
		};
	}

	// apply every pending edit in one transaction so a failure leaves the table untouched
	async applyEdits(payload: EditPayload): Promise<void> {
		const connection = this.requireConnection();
		const typeByName = new Map(payload.columns.map((name, index) => [name, payload.types[index]]));

		await connection.query('BEGIN TRANSACTION');
		try {
			for (const rename of payload.renamed) {
				await connection.query(
					`ALTER TABLE ${payload.table} RENAME COLUMN ${quoteIdentifier(rename.from)} TO ${quoteIdentifier(rename.to)}`
				);
			}

			for (const column of payload.added) {
				await connection.query(
					`ALTER TABLE ${payload.table} ADD COLUMN ${quoteIdentifier(column.name)} ${column.type}`
				);
			}

			for (const update of payload.updates) {
				await connection.query(
					`UPDATE ${payload.table} SET ${quoteIdentifier(update.column)} = ${toSqlLiteral(update.value, typeByName.get(update.column))} WHERE rowid = ${update.rowid}`
				);
			}

			for (const rowid of payload.deletes) {
				await connection.query(`DELETE FROM ${payload.table} WHERE rowid = ${rowid}`);
			}

			for (const values of payload.inserts) {
				const list = values
					.map((value, index) => toSqlLiteral(value, payload.types[index]))
					.join(', ');
				await connection.query(`INSERT INTO ${payload.table} VALUES (${list})`);
			}

			await connection.query('COMMIT');
		} catch (error) {
			await connection.query('ROLLBACK');
			throw error;
		}
	}

	// write the table to a virtual file and hand back its bytes for a browser download
	async exportTable(qualified: string, kind: FileKind, baseName: string): Promise<ExportFile> {
		const db = this.requireDb();
		const connection = this.requireConnection();
		const format = EXPORT_FORMATS[kind];
		const path = `export_${(this.exportSequence += 1)}.${format.extension}`;

		if (kind === 'xlsx') {
			await connection.query('INSTALL excel; LOAD excel;');
		}

		await connection.query(`COPY ${qualified} TO ${quoteLiteral(path)} ${format.options}`);
		const buffer = await db.copyFileToBuffer(path);
		await db.dropFile(path);

		return {
			blob: exportBlob(format, buffer),
			filename: `${baseName}.${format.extension}`
		};
	}

	// export the current query result, spreadsheet format loads the excel extension on demand
	async exportQuery(sql: string, format: ExportFormatKey, baseName: string): Promise<ExportFile> {
		const db = this.requireDb();
		const connection = this.requireConnection();
		const spec = QUERY_EXPORT_FORMATS[format];
		const path = `export_${(this.exportSequence += 1)}.${spec.extension}`;

		if (format === 'xlsx') {
			await connection.query('INSTALL excel; LOAD excel;');
		}

		await connection.query(
			`COPY (${stripTrailingLimit(sql)}) TO ${quoteLiteral(path)} ${spec.options}`
		);
		const buffer = await db.copyFileToBuffer(path);
		await db.dropFile(path);

		return {
			blob: exportBlob(spec, buffer),
			filename: `${baseName}.${spec.extension}`
		};
	}

	// bundle every table as parquet plus a manifest into one zip, so a whole session can be backed up or moved
	async exportSession(): Promise<ExportFile> {
		const db = this.requireDb();
		const connection = this.requireConnection();
		const schemas = await this.listSchemas();
		const entries: ZipEntry[] = [];
		const tables: SessionManifest['tables'] = [];

		for (const [index, schema] of schemas.entries()) {
			const file = `tables/${index + 1}.parquet`;
			const path = `session_export_${(this.exportSequence += 1)}.parquet`;

			await connection.query(
				`COPY ${schema.qualified} TO ${quoteLiteral(path)} (FORMAT PARQUET, COMPRESSION zstd)`
			);
			const buffer = await db.copyFileToBuffer(path);
			await db.dropFile(path);

			entries.push({ name: file, data: buffer });
			tables.push({ name: schema.name, schema: schema.schema, file });
		}

		const manifest: SessionManifest = {
			version: SESSION_VERSION,
			createdAt: new Date().toISOString(),
			tables
		};
		entries.push({
			name: MANIFEST_FILE,
			data: new TextEncoder().encode(JSON.stringify(manifest, null, 2))
		});

		return {
			blob: new Blob([createZip(entries) as BlobPart], { type: 'application/zip' }),
			filename: 'tabler-session.zip'
		};
	}

	// recreate the tables from a session zip, a name that is already taken gets a unique suffix
	async importSession(bytes: Uint8Array): Promise<string[]> {
		const db = this.requireDb();
		const connection = this.requireConnection();
		const entries = await readZip(bytes);
		const manifestEntry = entries.find((entry) => entry.name === MANIFEST_FILE);
		if (!manifestEntry) throw new Error(translate('errors.notSessionArchive'));

		const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as SessionManifest;
		if (!Array.isArray(manifest.tables)) throw new Error(translate('errors.unreadableManifest'));

		const created: string[] = [];
		for (const table of manifest.tables) {
			const entry = entries.find((candidate) => candidate.name === table.file);
			if (!entry) continue;

			const path = `session_import_${(this.exportSequence += 1)}.parquet`;
			await db.registerFileBuffer(path, entry.data);
			try {
				const name = uniqueName(table.name, this.tableNames);
				await connection.query(
					`CREATE OR REPLACE TABLE ${quoteIdentifier(name)} AS SELECT * FROM read_parquet(${quoteLiteral(path)})`
				);
				this.tableNames.add(name);
				created.push(name);
			} finally {
				await db.dropFile(path);
			}
		}

		return created;
	}

	// drops tables that belong to a removed file, so their names can be reused
	async dropTables(names: string[]): Promise<void> {
		const connection = this.requireConnection();
		for (const name of names) {
			await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(name)}`);
			this.tableNames.delete(name);
		}
	}

	// clear every user table, the persistence feature needs a way back to a clean slate
	async dropAll(): Promise<void> {
		const connection = this.requireConnection();
		const listed = await this.queryOn(
			connection,
			`SELECT database_name, schema_name, table_name
			 FROM duckdb_tables()
			 WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'system')`
		);

		for (const ref of parseTables(listed)) {
			await connection.query(`DROP TABLE IF EXISTS ${ref.qualified}`);
			this.tableNames.delete(ref.name);
		}
	}

	async listSchemas(): Promise<TableSchema[]> {
		const connection = this.requireConnection();
		const listed = await this.queryOn(
			connection,
			`SELECT database_name, schema_name, table_name
			 FROM duckdb_tables()
			 WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'system')
			 ORDER BY database_name, schema_name, table_name`
		);

		const schemas: TableSchema[] = [];
		for (const ref of parseTables(listed)) {
			schemas.push({
				...ref,
				columns: await this.describe(connection, ref.qualified),
				rowCount: await this.countRows(connection, ref.qualified)
			});
		}

		return schemas;
	}

	private async registerFile(db: AsyncDuckDB, source: SourceFile): Promise<string> {
		const dot = source.name.lastIndexOf('.');
		const extension = dot >= 0 ? source.name.slice(dot) : '';
		const path = `${source.id}${extension}`;
		await db.registerFileHandle(
			path,
			source.file,
			duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
			true
		);
		return path;
	}

	private readerExpression(source: SourceFile, path: string): string {
		const target = quoteLiteral(path);
		switch (source.kind) {
			case 'tsv':
				return `read_csv_auto(${target}, delim='\t')`;
			case 'csv':
				return `read_csv_auto(${target})`;
			case 'json':
				return `read_json_auto(${target})`;
			case 'parquet':
				return `read_parquet(${target})`;
			case 'xlsx':
				return `read_xlsx(${target}, header = true)`;
			default:
				throw new Error(translate('errors.unsupportedFileKind', { kind: source.kind }));
		}
	}

	private async describe(
		connection: AsyncDuckDBConnection,
		qualified: string
	): Promise<TableSchema['columns']> {
		// ponytail: a single unreadable attached table yields no columns instead of failing the whole listing
		try {
			return parseColumns(await this.queryOn(connection, `DESCRIBE ${qualified}`));
		} catch {
			return [];
		}
	}

	// remember the tables already in the database, opfs keeps them across reloads so names must not collide
	private async syncTableNames(): Promise<void> {
		const result = await this.queryOn(
			this.requireConnection(),
			`SELECT table_name FROM duckdb_tables()
			 WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'system')`
		);

		for (const row of result.rows) {
			const name = row[0];
			if (name) this.tableNames.add(name);
		}
	}

	private async countRows(
		connection: AsyncDuckDBConnection,
		qualified: string
	): Promise<number | null> {
		// ponytail: counts are informational, a failing count just hides the row count
		try {
			const result = await this.queryOn(connection, `SELECT count(*) AS count FROM ${qualified}`);
			const value = result.rows[0]?.[0];
			return value === null || value === undefined ? null : Number(value);
		} catch {
			return null;
		}
	}

	private async queryOn(connection: AsyncDuckDBConnection, sql: string): Promise<QueryResult> {
		const startedAt = performance.now();
		const table = await connection.query(sql);
		const durationMs = performance.now() - startedAt;

		const columns = table.schema.fields.map((field) => ({
			name: field.name,
			type: String(field.type)
		}));
		const vectors = columns.map((_, index) => table.getChildAt(index));

		const rowCount = table.numRows;
		const displayCount = Math.min(rowCount, MAX_DISPLAY_ROWS);
		const rows: CellValue[][] = [];

		for (let rowIndex = 0; rowIndex < displayCount; rowIndex += 1) {
			const row: CellValue[] = [];
			for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
				const vector = vectors[columnIndex];
				row.push(formatCell(vector ? vector.get(rowIndex) : null, columns[columnIndex].type));
			}
			rows.push(row);
		}

		return { columns, rows, rowCount, truncated: rowCount > displayCount, durationMs };
	}

	private requireDb(): AsyncDuckDB {
		if (!this.db) throw new Error(translate('errors.engineNotInitialized'));
		return this.db;
	}

	private requireConnection(): AsyncDuckDBConnection {
		if (!this.connection) throw new Error(translate('errors.engineNotInitialized'));
		return this.connection;
	}
}
