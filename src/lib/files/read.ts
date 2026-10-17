import { fileKind } from './accept.js';
import { translate } from '../i18n/index.js';
import type { SourceFile } from './types.js';

export interface RejectedFile {
	name: string;
	reason: string;
}

export interface ReadResult {
	accepted: SourceFile[];
	rejected: RejectedFile[];
}

let sequence = 0;

// map dropped files to typed sources, skipping anything the engine cannot read
export function toSourceFiles(files: Iterable<File>): ReadResult {
	const accepted: SourceFile[] = [];
	const rejected: RejectedFile[] = [];

	for (const file of files) {
		const kind = fileKind(file.name);
		if (!kind) {
			rejected.push({ name: file.name, reason: translate('errors.unsupportedFileType') });
			continue;
		}
		accepted.push({
			id: `source_${++sequence}`,
			name: file.name,
			kind,
			size: file.size,
			file
		});
	}

	return { accepted, rejected };
}
