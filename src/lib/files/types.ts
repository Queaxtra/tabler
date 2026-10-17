export type FileKind = 'csv' | 'tsv' | 'json' | 'parquet' | 'sqlite' | 'xlsx' | 'xls';

export interface SourceFile {
	id: string;
	name: string;
	kind: FileKind;
	size: number;
	file: File;
}

// a source file after loading, carrying the tables it produced
export interface LoadedSource {
	id: string;
	name: string;
	kind: FileKind;
	size: number;
	tables: string[];
}
