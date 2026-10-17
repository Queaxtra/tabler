import type { FileKind } from '#lib/files/types.js';
import type { CellValue, ColumnAddition, EditableRow, EditPayload } from './types.js';

// types offered when adding a column, kept to the portable duckdb scalars
export const COLUMN_TYPES = [
	'VARCHAR',
	'INTEGER',
	'BIGINT',
	'DOUBLE',
	'BOOLEAN',
	'DATE',
	'TIMESTAMP'
] as const;

// identifies which table is open in the editor
export interface EditingTarget {
	table: string;
	label: string;
	kind: FileKind;
}

// the working copy of a table, edits live here until saved
export interface EditorState {
	columns: string[];
	types: string[];
	origins: string[];
	added: ColumnAddition[];
	rows: EditableRow[];
	deleted: string[];
	selected: string[];
	rowCount: number;
	truncated: boolean;
}

// index of original column names, used to detect renames and to diff cells
export type Baseline = Map<string, CellValue[]>;

export function emptyEditor(): EditorState {
	return {
		columns: [],
		types: [],
		origins: [],
		added: [],
		rows: [],
		deleted: [],
		selected: [],
		rowCount: 0,
		truncated: false
	};
}

export function applySnapshot(
	state: EditorState,
	snapshot: {
		columns: string[];
		types: string[];
		rows: EditableRow[];
		rowCount: number;
		truncated: boolean;
	}
): void {
	state.columns = snapshot.columns;
	state.types = snapshot.types;
	state.origins = [...snapshot.columns];
	state.added = [];
	state.rows = snapshot.rows;
	state.deleted = [];
	state.selected = [];
	state.rowCount = snapshot.rowCount;
	state.truncated = snapshot.truncated;
}

export function snapshotBaseline(rows: EditableRow[]): Baseline {
	return new Map(rows.map((row) => [row.key, [...row.values]]));
}

// the editable parts of the working copy, used to move through the undo history
export interface EditorSnapshot {
	columns: string[];
	types: string[];
	origins: string[];
	added: ColumnAddition[];
	rows: EditableRow[];
	deleted: string[];
}

export function snapshotState(state: EditorState): string {
	const snapshot: EditorSnapshot = {
		columns: state.columns,
		types: state.types,
		origins: state.origins,
		added: state.added,
		rows: state.rows,
		deleted: state.deleted
	};
	return JSON.stringify(snapshot);
}

export function restoreState(state: EditorState, json: string): void {
	const snapshot = JSON.parse(json) as EditorSnapshot;
	state.columns = snapshot.columns;
	state.types = snapshot.types;
	state.origins = snapshot.origins;
	state.added = snapshot.added;
	state.rows = snapshot.rows;
	state.deleted = snapshot.deleted;
	state.selected = [];
}

// number of pending edits, drives the save button and the dirty indicator
export function countChanges(state: EditorState, baseline: Baseline): number {
	let count = state.deleted.length + state.added.length;
	count += state.columns.filter(
		(name, index) => state.origins[index] !== '' && state.origins[index] !== name
	).length;

	for (const row of state.rows) {
		if (row.isNew) {
			count += 1;
			continue;
		}
		const base = baseline.get(row.key);
		if (base && row.values.some((value, index) => value !== base[index])) count += 1;
	}

	return count;
}

export function buildEditPayload(
	table: string,
	state: EditorState,
	baseline: Baseline
): EditPayload {
	const updates: EditPayload['updates'] = [];
	for (const row of state.rows) {
		if (row.isNew) continue;
		const base = baseline.get(row.key);
		if (!base) continue;
		for (let index = 0; index < state.columns.length; index += 1) {
			if (row.values[index] !== base[index]) {
				updates.push({ rowid: row.key, column: state.columns[index], value: row.values[index] });
			}
		}
	}

	const renamed = state.columns
		.map((name, index) => ({ from: state.origins[index], to: name }))
		.filter((entry) => entry.from !== '' && entry.from !== entry.to);

	return {
		table,
		columns: state.columns,
		types: state.types,
		added: state.added,
		renamed,
		updates,
		deletes: state.deleted,
		inserts: state.rows.filter((row) => row.isNew).map((row) => row.values)
	};
}
