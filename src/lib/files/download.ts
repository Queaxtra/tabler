// trigger a browser download for an in-memory blob, no server round trip
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}

// strip the trailing extension from a file name, keeping the rest intact
export function baseName(filename: string): string {
	const dot = filename.lastIndexOf('.');
	return dot > 0 ? filename.slice(0, dot) : filename;
}
