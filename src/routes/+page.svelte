<script lang="ts">
	import { onMount } from 'svelte';
	import Hero from '../components/Hero.svelte';
	import Footer from '../components/Footer.svelte';
	import QueryPanel from '../components/QueryPanel.svelte';
	import ShortcutsDialog from '../components/ShortcutsDialog.svelte';
	import SourcesPanel from '../components/SourcesPanel.svelte';
	import * as Alert from '../lib/components/ui/alert/index.js';
	import { toSourceFiles } from '../lib/files/read.js';
	import { downloadBlob } from '../lib/files/download.js';
	import { t } from '../lib/i18n/index.js';
	import { provideShortcuts, ShortcutRegistry } from '../lib/shortcuts/index.js';
	import { SQL_KEYWORDS } from '../lib/db/keywords.js';
	import type { EditingTarget } from '../lib/db/editing.js';
	import type { FileKind, LoadedSource } from '../lib/files/types.js';
	import type { QueryResult, QueryView, TableSchema } from '../lib/db/types.js';
	import type { QueryEngine } from '../lib/db/engine.js';

	type Status = 'loading' | 'ready' | 'error';

	const shortcuts = new ShortcutRegistry();
	provideShortcuts(shortcuts);

	let engine = $state<QueryEngine | null>(null);
	let status = $state<Status>('loading');
	let engineError = $state('');

	let loadedFiles = $state<LoadedSource[]>([]);
	let activeFileId = $state<string | null>(null);
	let tables = $state<TableSchema[]>([]);

	let sql = $state('');
	let result = $state<QueryResult | null>(null);
	let editing = $state<EditingTarget | null>(null);
	let runToken = $state(0);
	let runRequest = $state(0);
	let refreshing = $state(false);
	let queryError = $state('');
	let queryBusy = $state(false);
	let fileBusy = $state(false);
	let sessionBusy = $state(false);
	let rejectionMessage = $state('');
	let shortcutsOpen = $state(false);
	let refineSequence = 0;
	let errorTimer: ReturnType<typeof setTimeout> | null = null;
	let rejectionTimer: ReturnType<typeof setTimeout> | null = null;

	function showEngineError(message: string) {
		engineError = message;
		if (errorTimer) clearTimeout(errorTimer);
		errorTimer = setTimeout(() => {
			engineError = '';
			errorTimer = null;
		}, 3000);
	}

	function showRejectionMessage(message: string) {
		rejectionMessage = message;
		if (rejectionTimer) clearTimeout(rejectionTimer);
		rejectionTimer = setTimeout(() => {
			rejectionMessage = '';
			rejectionTimer = null;
		}, 3000);
	}

	// table and column names plus keywords, offered by the editor autocomplete
	const suggestions = $derived.by(() => {
		const names = new Set<string>(SQL_KEYWORDS);
		for (const table of tables) {
			names.add(table.name);
			for (const column of table.columns) names.add(column.name);
		}
		return [...names];
	});

	// pause global shortcuts while the help dialog owns the keyboard
	$effect(() => {
		shortcuts.setEnabled(!shortcutsOpen);
	});

	// editing the query clears a previous error so the run button unlocks again
	$effect(() => {
		void sql;
		queryError = '';
	});

	onMount(() => {
		shortcuts.register('show-shortcuts', openShortcuts);
		shortcuts.register('close-layer', blurActiveElement);
		shortcuts.attach();
		void boot();

		return () => {
			shortcuts.detach();
			if (errorTimer) clearTimeout(errorTimer);
			if (rejectionTimer) clearTimeout(rejectionTimer);
		};
	});

	function openShortcuts() {
		shortcutsOpen = true;
	}

	function blurActiveElement() {
		const active = document.activeElement;
		if (active instanceof HTMLElement) active.blur();
	}

	async function boot() {
		status = 'loading';
		engineError = '';
		try {
			const { QueryEngine: Engine } = await import('../lib/db/engine.js');
			engine = new Engine();
			await engine.initialize();
			// a persistent database already holds the tables from the previous visit
			await refreshSchemas(engine);
			status = 'ready';
		} catch (error) {
			status = 'error';
			showEngineError(describeError(error));
		}
	}

	async function handleFiles(files: File[]) {
		const active = engine;
		if (!active) return;

		const { accepted, rejected } = toSourceFiles(files);
		showRejectionMessage(rejected.map((file) => `${file.name}: ${file.reason}`).join(', '));
		if (accepted.length === 0) return;

		fileBusy = true;
		try {
			for (const source of accepted) {
				const created = await active.load(source);
				loadedFiles = [
					...loadedFiles,
					{
						id: source.id,
						name: source.name,
						kind: source.kind,
						size: source.size,
						tables: created
					}
				];
				activeFileId = source.id;
			}
			await refreshSchemas(active);
		} catch (error) {
			showEngineError(describeError(error));
		} finally {
			fileBusy = false;
		}
	}

	async function refreshSchemas(active: QueryEngine) {
		tables = await active.listSchemas();
		if (sql.trim() === '' && tables.length > 0) {
			sql = `SELECT * FROM ${tables[0].qualified} LIMIT 100;`;
		}
	}

	async function exportSession() {
		const active = engine;
		if (!active) return;

		sessionBusy = true;
		engineError = '';
		try {
			const file = await active.exportSession();
			downloadBlob(file.blob, file.filename);
		} catch (error) {
			showEngineError(describeError(error));
		} finally {
			sessionBusy = false;
		}
	}

	async function importSession(file: File) {
		const active = engine;
		if (!active) return;

		sessionBusy = true;
		engineError = '';
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			await active.importSession(bytes);
			await refreshSchemas(active);
		} catch (error) {
			showEngineError(describeError(error));
		} finally {
			sessionBusy = false;
		}
	}

	async function resetDatabase() {
		const active = engine;
		if (!active) return;
		if (!window.confirm($t('page.confirmReset'))) return;

		sessionBusy = true;
		engineError = '';
		try {
			await active.dropAll();
			loadedFiles = [];
			activeFileId = null;
			tables = [];
			sql = '';
			result = null;
			editing = null;
			queryError = '';
		} catch (error) {
			showEngineError(describeError(error));
		} finally {
			sessionBusy = false;
		}
	}

	// opening a file or table loads it into the editor so its rows can be changed
	function openEditor(table: TableSchema, kind: FileKind, label: string) {
		result = null;
		queryError = '';
		editing = { table: table.qualified, label, kind };
	}

	function selectFile(file: LoadedSource) {
		activeFileId = file.id;
		const schema = tables.find((table) => table.name === file.tables[0]);
		if (schema) openEditor(schema, file.kind, file.name);
	}

	function selectTable(table: TableSchema) {
		const source = loadedFiles.find((file) => file.tables.includes(table.name));
		activeFileId = source?.id ?? activeFileId;
		openEditor(table, source?.kind ?? 'csv', source?.name ?? table.name);
	}

	// right-click "Run query": fill the editor with a preview of the file and run it
	function runFileQuery(file: LoadedSource) {
		activeFileId = file.id;
		const qualified =
			tables.find((table) => table.name === file.tables[0])?.qualified ?? file.tables[0];
		if (!qualified) return;

		editing = null;
		queryError = '';
		sql = `SELECT * FROM ${qualified} LIMIT 100;`;
		runRequest += 1;
	}

	async function removeFile(file: LoadedSource) {
		await removeFiles([file]);
	}

	// deletes the file's tables and forgets it, clearing any view that pointed at it
	async function removeFiles(files: LoadedSource[]) {
		const active = engine;
		if (!active || files.length === 0) return;

		const ids = new Set(files.map((file) => file.id));
		const dropped = new Set(files.flatMap((file) => file.tables));

		try {
			await active.dropTables([...dropped]);
		} catch (error) {
			showEngineError(describeError(error));
			return;
		}

		loadedFiles = loadedFiles.filter((file) => !ids.has(file.id));
		if (activeFileId && ids.has(activeFileId)) activeFileId = null;
		await refreshSchemas(active);

		// close the editor only when its table no longer exists after the drop
		const open = editing;
		if (open && !tables.some((table) => table.qualified === open.table)) editing = null;
	}

	async function runQuery() {
		const active = engine;
		if (!active || sql.trim() === '') return;

		queryBusy = true;
		queryError = '';
		editing = null;
		try {
			result = await active.run(sql);
			runToken += 1;
		} catch (error) {
			result = null;
			queryError = describeError(error);
		} finally {
			queryBusy = false;
		}
	}

	// search, filters and sorting run in duckdb over the whole query, not just the loaded rows
	async function refineQuery(view: QueryView, columns: string[]) {
		const active = engine;
		if (!active || sql.trim() === '') return;

		const sequence = (refineSequence += 1);
		refreshing = true;
		try {
			const found = await active.refine(sql, view, columns);
			// ignore a stale response when a newer refinement already started
			if (sequence === refineSequence) result = found;
		} catch (error) {
			if (sequence === refineSequence) queryError = describeError(error);
		} finally {
			if (sequence === refineSequence) refreshing = false;
		}
	}

	function clearAll() {
		sql = '';
		result = null;
		editing = null;
		queryError = '';
	}

	async function refreshAfterEdit() {
		if (engine) await refreshSchemas(engine);
	}

	function describeError(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<div class="flex min-h-[100dvh] flex-col bg-background lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
	<Hero onshortcuts={openShortcuts} />

	{#if engineError || rejectionMessage}
		<div class="flex shrink-0 flex-col gap-3 px-4 pt-4">
			{#if engineError}
				<Alert.Root variant="destructive">
					<Alert.Title>{$t('page.engineError')}</Alert.Title>
					<Alert.Description>{engineError}</Alert.Description>
				</Alert.Root>
			{/if}
			{#if rejectionMessage}
				<Alert.Root>
					<Alert.Title>{$t('page.unsupportedFiles')}</Alert.Title>
					<Alert.Description>{rejectionMessage}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>
	{/if}

	<main class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
		<SourcesPanel
			{status}
			files={loadedFiles}
			{tables}
			activeId={activeFileId}
			busy={fileBusy}
			{sessionBusy}
			onfiles={handleFiles}
			onselectfile={selectFile}
			onselect={selectTable}
			onrunfile={runFileQuery}
			ondeletefile={removeFile}
			ondeleteselected={removeFiles}
			onexportsession={exportSession}
			onimportsession={importSession}
			onreset={resetDatabase}
		/>

		<QueryPanel
			{status}
			{engine}
			{editing}
			bind:sql
			{result}
			{runToken}
			{refreshing}
			{suggestions}
			{runRequest}
			error={queryError}
			busy={queryBusy}
			onrun={runQuery}
			onrefine={refineQuery}
			onclear={clearAll}
			oncloseeditor={() => (editing = null)}
			onschemachanged={refreshAfterEdit}
		/>
	</main>

	<ShortcutsDialog bind:open={shortcutsOpen} />
	<Footer />
</div>
