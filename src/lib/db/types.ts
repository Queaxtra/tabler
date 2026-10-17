// cells are pre-formatted by the engine so ui stays presentation-only
export type CellValue = string | null;

export interface ColumnSchema {
	name: string;
	type: string;
	nullable: boolean;
}

export interface TableRef {
	database: string;
	schema: string;
	name: string;
	qualified: string;
}

export interface TableSchema extends TableRef {
	columns: ColumnSchema[];
	rowCount: number | null;
}

export interface QueryColumn {
	name: string;
	type: string;
}

export interface QueryResult {
	columns: QueryColumn[];
	rows: CellValue[][];
	rowCount: number;
	truncated: boolean;
	durationMs: number;
}

export interface SortSpec {
	column: string;
	desc: boolean;
}

export interface FilterSpec {
	column: string;
	term: string;
}

// refinement applied on top of a query: free-text search, per-column filters and sorting
export interface QueryView {
	search: string;
	sorts: SortSpec[];
	filters: FilterSpec[];
}

export type ExportFormatKey = 'csv' | 'json' | 'parquet' | 'xlsx';

// a row inside an editable table view, keyed by its duckdb rowid (drafts use a temporary key)
export interface EditableRow {
	key: string;
	values: CellValue[];
	isNew: boolean;
}

export interface EditableTable {
	table: string;
	columns: string[];
	types: string[];
	rows: EditableRow[];
	rowCount: number;
	truncated: boolean;
}

export interface ColumnAddition {
	name: string;
	type: string;
}

export interface ColumnRename {
	from: string;
	to: string;
}

export interface CellUpdate {
	rowid: string;
	column: string;
	value: CellValue;
}

// everything needed to commit one editing session in a single transaction
export interface EditPayload {
	table: string;
	columns: string[];
	types: string[];
	added: ColumnAddition[];
	renamed: ColumnRename[];
	updates: CellUpdate[];
	deletes: string[];
	inserts: CellValue[][];
}

export interface ExportFile {
	blob: Blob;
	filename: string;
}

// one table inside a session archive, the file is a parquet payload within the zip
export interface SessionTable {
	name: string;
	schema: string;
	file: string;
}

export interface SessionManifest {
	version: number;
	createdAt: string;
	tables: SessionTable[];
}
