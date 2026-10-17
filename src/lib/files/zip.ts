import { translate } from '../i18n/index.js';

// minimal zip codec for session archives, entries are stored and deflated entries are read back
// the browser platform features (text encoder, decompression stream) cover the whole job, no dependency

export interface ZipEntry {
	name: string;
	data: Uint8Array;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
const UTF8_FLAG = 0x0800;
const END_SIZE = 22;
const END_SEARCH = 0xffff;
const CRC_TABLE = buildCrcTable();

// stored entries only, deflate is pointless on already compressed parquet payloads
export function createZip(entries: ZipEntry[], now = new Date()): Uint8Array {
	const encoder = new TextEncoder();
	const body: Uint8Array[] = [];
	const directory: Uint8Array[] = [];
	const time = toDosTime(now);
	const date = toDosDate(now);
	let offset = 0;

	for (const entry of entries) {
		const name = encoder.encode(entry.name);
		const crc = crc32(entry.data);
		const size = entry.data.length;

		const local = new Uint8Array(30 + name.length);
		const localView = new DataView(local.buffer);
		localView.setUint32(0, LOCAL_SIGNATURE, true);
		localView.setUint16(4, 20, true);
		localView.setUint16(6, UTF8_FLAG, true);
		localView.setUint16(8, METHOD_STORED, true);
		localView.setUint16(10, time, true);
		localView.setUint16(12, date, true);
		localView.setUint32(14, crc, true);
		localView.setUint32(18, size, true);
		localView.setUint32(22, size, true);
		localView.setUint16(26, name.length, true);
		localView.setUint16(28, 0, true);
		local.set(name, 30);

		body.push(local, entry.data);

		const record = new Uint8Array(46 + name.length);
		const recordView = new DataView(record.buffer);
		recordView.setUint32(0, CENTRAL_SIGNATURE, true);
		recordView.setUint16(4, 20, true);
		recordView.setUint16(6, 20, true);
		recordView.setUint16(8, UTF8_FLAG, true);
		recordView.setUint16(10, METHOD_STORED, true);
		recordView.setUint16(12, time, true);
		recordView.setUint16(14, date, true);
		recordView.setUint32(16, crc, true);
		recordView.setUint32(20, size, true);
		recordView.setUint32(24, size, true);
		recordView.setUint16(28, name.length, true);
		recordView.setUint16(30, 0, true);
		recordView.setUint16(32, 0, true);
		recordView.setUint16(34, 0, true);
		recordView.setUint16(36, 0, true);
		recordView.setUint32(38, 0, true);
		recordView.setUint32(42, offset, true);
		record.set(name, 46);
		directory.push(record);

		offset += local.length + size;
	}

	const centralSize = directory.reduce((total, record) => total + record.length, 0);
	const end = new Uint8Array(END_SIZE);
	const endView = new DataView(end.buffer);
	endView.setUint32(0, END_SIGNATURE, true);
	endView.setUint16(8, entries.length, true);
	endView.setUint16(10, entries.length, true);
	endView.setUint32(12, centralSize, true);
	endView.setUint32(16, offset, true);

	return concat([...body, ...directory, end]);
}

// reads stored and deflated entries, enough for archives written by this app or by a desktop tool
export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const end = findEnd(view);
	if (end < 0) throw new Error(translate('errors.notZip'));

	const decoder = new TextDecoder();
	const count = view.getUint16(end + 10, true);
	let pointer = view.getUint32(end + 16, true);
	const entries: ZipEntry[] = [];

	for (let index = 0; index < count; index += 1) {
		if (view.getUint32(pointer, true) !== CENTRAL_SIGNATURE)
			throw new Error(translate('errors.corruptZip'));

		const method = view.getUint16(pointer + 10, true);
		const compressedSize = view.getUint32(pointer + 20, true);
		const nameLength = view.getUint16(pointer + 28, true);
		const extraLength = view.getUint16(pointer + 30, true);
		const commentLength = view.getUint16(pointer + 32, true);
		const localOffset = view.getUint32(pointer + 42, true);
		const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));

		const localNameLength = view.getUint16(localOffset + 26, true);
		const localExtraLength = view.getUint16(localOffset + 28, true);
		const start = localOffset + 30 + localNameLength + localExtraLength;

		entries.push({ name, data: await unpack(bytes, start, compressedSize, method) });
		pointer += 46 + nameLength + extraLength + commentLength;
	}

	return entries;
}

async function unpack(
	bytes: Uint8Array,
	start: number,
	size: number,
	method: number
): Promise<Uint8Array> {
	const raw = bytes.slice(start, start + size);
	if (method === METHOD_STORED) return raw;
	if (method !== METHOD_DEFLATED)
		throw new Error(translate('errors.unsupportedCompression', { method }));

	const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEnd(view: DataView): number {
	const floor = Math.max(0, view.byteLength - END_SIZE - END_SEARCH);
	for (let pointer = view.byteLength - END_SIZE; pointer >= floor; pointer -= 1) {
		if (view.getUint32(pointer, true) === END_SIGNATURE) return pointer;
	}
	return -1;
}

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let index = 0; index < bytes.length; index += 1) {
		crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function buildCrcTable(): Uint32Array {
	const table = new Uint32Array(256);
	for (let value = 0; value < 256; value += 1) {
		let crc = value;
		for (let bit = 0; bit < 8; bit += 1) {
			crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
		}
		table[value] = crc >>> 0;
	}
	return table;
}

function concat(parts: Uint8Array[]): Uint8Array {
	const total = parts.reduce((sum, part) => sum + part.length, 0);
	const joined = new Uint8Array(total);
	let offset = 0;
	for (const part of parts) {
		joined.set(part, offset);
		offset += part.length;
	}
	return joined;
}

function toDosTime(date: Date): number {
	return (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
}

function toDosDate(date: Date): number {
	return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}
