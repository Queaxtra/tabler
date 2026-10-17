<script lang="ts">
	import { onMount } from 'svelte';
	import { tick } from 'svelte';
	import AddCircleIcon from '~icons/solar/add-circle-linear';
	import CloseIcon from '~icons/solar/close-linear';
	import ColumnsIcon from '~icons/solar/columns-3-linear';
	import DisketteIcon from '~icons/solar/diskette-linear';
	import DownloadIcon from '~icons/solar/download-linear';
	import LoaderIcon from '~icons/solar/loader-linear';
	import RedoIcon from '~icons/solar/undo-right-linear';
	import RestartIcon from '~icons/solar/restart-linear';
	import TrashIcon from '~icons/solar/trash-bin-minimalistic-linear';
	import UndoIcon from '~icons/solar/undo-left-linear';
	import AddColumnDialog from './AddColumnDialog.svelte';
	import * as Alert from '../lib/components/ui/alert/index.js';
	import { Button } from '../lib/components/ui/button/index.js';
	import * as Table from '../lib/components/ui/table/index.js';
	import {
		applySnapshot,
		buildEditPayload,
		countChanges,
		emptyEditor,
		restoreState,
		snapshotBaseline,
		snapshotState,
		type Baseline,
		type EditingTarget,
		type EditorState
	} from '../lib/db/editing.js';
	import { baseName, downloadBlob } from '../lib/files/download.js';
	import { t } from '../lib/i18n/index.js';
	import { useShortcuts } from '../lib/shortcuts/index.js';
	import { cn } from '../lib/utils.js';
	import type { QueryEngine } from '../lib/db/engine.js';
	import type { EditableRow } from '../lib/db/types.js';

	let {
		engine,
		target,
		onclose,
		onchanged
	}: {
		engine: QueryEngine;
		target: EditingTarget;
		onclose: () => void;
		onchanged: () => void | Promise<void>;
	} = $props();

	let editor = $state<EditorState>(emptyEditor());
	let baseline = $state<Baseline>(new Map());
	let loading = $state(false);
	let saving = $state(false);
	let exporting = $state(false);
	let error = $state('');
	let draftSequence = 0;

	let cell = $state<{ key: string; index: number } | null>(null);
	let cellDraft = $state('');
	let header = $state<number | null>(null);
	let headerDraft = $state('');
	let addColumnOpen = $state(false);
	let scroller = $state<HTMLElement | null>(null);

	// undo history holds serialized editor states, index points at the current one
	let history = $state<string[]>([]);
	let historyIndex = $state(-1);
	let cursor = $state<{ row: number; col: number } | null>(null);

	const shortcuts = useShortcuts();

	const changes = $derived(countChanges(editor, baseline));
	const allSelected = $derived(
		editor.rows.length > 0 && editor.selected.length === editor.rows.length
	);
	const canUndo = $derived(historyIndex > 0);
	const canRedo = $derived(historyIndex < history.length - 1);

	$effect(() => {
		if (!shortcuts) return;
		const offUndo = shortcuts.register('undo-edit', undo);
		const offRedo = shortcuts.register('redo-edit', redo);
		return () => {
			offUndo();
			offRedo();
		};
	});

	// keep the focused cell in view as the cursor moves
	$effect(() => {
		const active = cursor;
		if (!active || cell) return;
		scroller?.querySelector<HTMLElement>(`[data-cell="${active.row}-${active.col}"]`)?.focus();
	});

	onMount(() => {
		void load();
	});

	async function load() {
		loading = true;
		error = '';
		try {
			adopt(await engine.openTable(target.table));
		} catch (failure) {
			error = message(failure);
		} finally {
			loading = false;
		}
	}

	function adopt(snapshot: Awaited<ReturnType<QueryEngine['openTable']>>) {
		applySnapshot(editor, snapshot);
		baseline = snapshotBaseline(snapshot.rows);
		history = [snapshotState(editor)];
		historyIndex = 0;
		cell = null;
		cursor = null;
	}

	// snapshots the current state so it can be undone later
	function record() {
		history = [...history.slice(0, historyIndex + 1), snapshotState(editor)];
		historyIndex = history.length - 1;
	}

	function undo() {
		if (!canUndo) return;
		historyIndex -= 1;
		restoreState(editor, history[historyIndex]);
		cell = null;
		cursor = null;
	}

	function redo() {
		if (!canRedo) return;
		historyIndex += 1;
		restoreState(editor, history[historyIndex]);
		cell = null;
		cursor = null;
	}

	// cell editing
	function isCellEditing(key: string, index: number): boolean {
		return cell?.key === key && cell.index === index;
	}

	function startCell(row: EditableRow, index: number) {
		cell = { key: row.key, index };
		cellDraft = row.values[index] ?? '';
	}

	function commitCell() {
		const active = cell;
		cell = null;
		if (!active) return;

		const row = editor.rows.find((candidate) => candidate.key === active.key);
		if (!row) return;

		const next = cellDraft === '' ? null : cellDraft;
		if (row.values[active.index] === next) return;
		row.values[active.index] = next;
		record();
	}

	function cancelCell() {
		cell = null;
	}

	function handleCellKey(event: KeyboardEvent, multiline: boolean) {
		if (event.key === 'Escape') {
			event.preventDefault();
			cancelCell();
			return;
		}
		if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			commitCell();
		}
	}

	// spreadsheet style navigation over non-editing cells
	function moveCursor(row: number, col: number) {
		const maxRow = editor.rows.length - 1;
		const maxCol = editor.columns.length - 1;
		cursor = {
			row: Math.max(0, Math.min(row, maxRow)),
			col: Math.max(0, Math.min(col, maxCol))
		};
	}

	function handleGridKey(event: KeyboardEvent, rowIndex: number, colIndex: number) {
		if (cell) return;

		switch (event.key) {
			case 'ArrowUp':
				event.preventDefault();
				moveCursor(rowIndex - 1, colIndex);
				break;
			case 'ArrowDown':
				event.preventDefault();
				moveCursor(rowIndex + 1, colIndex);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				moveCursor(rowIndex, colIndex - 1);
				break;
			case 'ArrowRight':
				event.preventDefault();
				moveCursor(rowIndex, colIndex + 1);
				break;
			case 'Enter':
			case 'F2':
				event.preventDefault();
				startCell(editor.rows[rowIndex], colIndex);
				break;
			case 'Delete':
			case 'Backspace':
				event.preventDefault();
				clearCell(rowIndex, colIndex);
				break;
			default:
				break;
		}
	}

	function clearCell(rowIndex: number, colIndex: number) {
		const row = editor.rows[rowIndex];
		if (!row || row.values[colIndex] === null) return;
		row.values[colIndex] = null;
		record();
	}

	// header rename
	function startHeader(index: number) {
		header = index;
		headerDraft = editor.columns[index];
	}

	function commitHeader() {
		if (header === null) return;
		const index = header;
		header = null;

		const name = headerDraft.trim();
		if (!name || editor.columns[index] === name) return;
		editor.columns[index] = name;
		record();
	}

	// row operations
	function addRow() {
		const key = `new_${(draftSequence += 1)}`;
		const index = editor.rows.length;
		editor.rows = [...editor.rows, { key, values: editor.columns.map(() => null), isNew: true }];
		record();
		cursor = { row: index, col: 0 };
		void scrollToRow(key);
	}

	// bring a freshly added row into view once it is rendered
	async function scrollToRow(key: string) {
		await tick();
		scroller?.querySelector(`[data-row-key="${key}"]`)?.scrollIntoView({ block: 'nearest' });
	}

	function removeRow(key: string) {
		const row = editor.rows.find((candidate) => candidate.key === key);
		if (!row) return;
		editor.rows = editor.rows.filter((candidate) => candidate.key !== key);
		if (!row.isNew) editor.deleted = [...editor.deleted, key];
		editor.selected = editor.selected.filter((selected) => selected !== key);
		if (cell?.key === key) cell = null;
		cursor = null;
	}

	function deleteRow(key: string) {
		removeRow(key);
		record();
	}

	function deleteSelected() {
		for (const key of [...editor.selected]) removeRow(key);
		record();
	}

	function toggleRow(key: string) {
		editor.selected = editor.selected.includes(key)
			? editor.selected.filter((selected) => selected !== key)
			: [...editor.selected, key];
	}

	function toggleAll() {
		editor.selected = allSelected ? [] : editor.rows.map((row) => row.key);
	}

	function addColumn(name: string, type: string) {
		editor.columns = [...editor.columns, name];
		editor.types = [...editor.types, type];
		editor.origins = [...editor.origins, ''];
		editor.added = [...editor.added, { name, type }];
		editor.rows = editor.rows.map((row) => ({ ...row, values: [...row.values, null] }));
		for (const [key, values] of baseline) baseline.set(key, [...values, null]);
		record();
	}

	// persistence
	async function save() {
		if (changes === 0 || saving) return;
		saving = true;
		error = '';
		try {
			await engine.applyEdits(buildEditPayload(target.table, editor, baseline));
			adopt(await engine.openTable(target.table));
			await onchanged();
		} catch (failure) {
			error = message(failure);
		} finally {
			saving = false;
		}
	}

	async function discard() {
		error = '';
		try {
			adopt(await engine.openTable(target.table));
		} catch (failure) {
			error = message(failure);
		}
	}

	async function exportTable() {
		if (exporting) return;
		exporting = true;
		error = '';
		try {
			const file = await engine.exportTable(target.table, target.kind, baseName(target.label));
			downloadBlob(file.blob, file.filename);
		} catch (failure) {
			error = message(failure);
		} finally {
			exporting = false;
		}
	}

	function message(failure: unknown): string {
		return failure instanceof Error ? failure.message : String(failure);
	}

	function focusCell(node: HTMLElement) {
		node.focus();
		if (node instanceof HTMLInputElement) {
			node.select();
			return;
		}
		if (node instanceof HTMLTextAreaElement) {
			node.setSelectionRange(node.value.length, node.value.length);
		}
	}

	function isMultiline(value: string | null): boolean {
		return value !== null && value.includes('\n');
	}
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 items-center gap-2">
			<span class="truncate text-sm font-medium">{target.label}</span>
			{#if changes > 0}
				<span class="shrink-0 text-xs text-muted-foreground">
					{$t(changes === 1 ? 'dataEditor.pendingChange' : 'dataEditor.pendingChanges', {
						count: changes
					})}
				</span>
			{:else}
				<span class="shrink-0 text-xs text-muted-foreground">{$t('dataEditor.saved')}</span>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="ghost"
				size="icon-sm"
				onclick={undo}
				disabled={!canUndo}
				aria-label={$t('dataEditor.undo')}
				title={$t('dataEditor.undo')}
			>
				<UndoIcon />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				onclick={redo}
				disabled={!canRedo}
				aria-label={$t('dataEditor.redo')}
				title={$t('dataEditor.redo')}
			>
				<RedoIcon />
			</Button>

			<Button variant="outline" size="sm" onclick={addRow} disabled={loading}>
				<AddCircleIcon data-icon="inline-start" />
				{$t('dataEditor.addRow')}
			</Button>
			<Button variant="outline" size="sm" onclick={() => (addColumnOpen = true)} disabled={loading}>
				<ColumnsIcon data-icon="inline-start" />
				{$t('dataEditor.addColumn')}
			</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={deleteSelected}
				disabled={editor.selected.length === 0}
			>
				<TrashIcon data-icon="inline-start" />
				{$t('common.delete')}{#if editor.selected.length > 0}&nbsp;({editor.selected.length}){/if}
			</Button>
			<Button variant="outline" size="sm" onclick={discard} disabled={changes === 0 || saving}>
				<RestartIcon data-icon="inline-start" />
				{$t('dataEditor.discard')}
			</Button>
			<Button size="sm" onclick={save} disabled={changes === 0 || saving}>
				{#if saving}
					<LoaderIcon data-icon="inline-start" class="animate-spin" />
				{:else}
					<DisketteIcon data-icon="inline-start" />
				{/if}
				{$t('common.save')}
			</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={exportTable}
				disabled={exporting || changes > 0}
				title={changes > 0 ? $t('dataEditor.saveFirst') : $t('dataEditor.downloadTable')}
			>
				{#if exporting}
					<LoaderIcon data-icon="inline-start" class="animate-spin" />
				{:else}
					<DownloadIcon data-icon="inline-start" />
				{/if}
				{$t('common.download')}
			</Button>
			<Button variant="ghost" size="icon-sm" onclick={onclose} aria-label={$t('dataEditor.close')}>
				<CloseIcon />
			</Button>
		</div>
	</div>

	{#if error}
		<Alert.Root variant="destructive">
			<Alert.Title>{$t('dataEditor.errorTitle')}</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}

	<div bind:this={scroller} class="min-h-0 flex-1 overflow-auto border border-border">
		{#if loading}
			<div class="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
				<LoaderIcon class="size-4 animate-spin" />
				{$t('dataEditor.loading')}
			</div>
		{:else if editor.rows.length === 0 && editor.columns.length === 0}
			<p class="py-16 text-center text-sm text-muted-foreground">{$t('dataEditor.noColumns')}</p>
		{:else}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="sticky top-0 z-10 w-10 bg-background">
							<input
								type="checkbox"
								class="size-3.5 align-middle"
								checked={allSelected}
								onchange={toggleAll}
								aria-label={$t('dataEditor.selectAll')}
							/>
						</Table.Head>

						{#each editor.columns as column, index (index)}
							<Table.Head class="sticky top-0 z-10 bg-background whitespace-nowrap">
								{#if header === index}
									<input
										class="h-6 w-full min-w-24 border border-input bg-background px-1 font-mono text-xs outline-none"
										bind:value={headerDraft}
										use:focusCell
										onblur={commitHeader}
										onkeydown={(event) => {
											if (event.key === 'Enter') commitHeader();
											if (event.key === 'Escape') header = null;
										}}
									/>
								{:else}
									<button
										type="button"
										class="flex items-baseline gap-1 text-left"
										title={$t('dataEditor.renameHint')}
										ondblclick={() => startHeader(index)}
									>
										{column}
										<span class="font-normal text-muted-foreground">{editor.types[index]}</span>
									</button>
								{/if}
							</Table.Head>
						{/each}

						<Table.Head class="sticky top-0 z-10 w-10 bg-background"></Table.Head>
					</Table.Row>
				</Table.Header>

				<Table.Body>
					{#each editor.rows as row, rowIndex (row.key)}
						<Table.Row class={row.isNew ? 'bg-muted/40' : ''} data-row-key={row.key}>
							<Table.Cell>
								<input
									type="checkbox"
									class="size-3.5 align-middle"
									checked={editor.selected.includes(row.key)}
									onchange={() => toggleRow(row.key)}
									aria-label={$t('dataEditor.selectRow')}
								/>
							</Table.Cell>

							{#each row.values as value, index (index)}
								{@const editing = isCellEditing(row.key, index)}
								<Table.Cell
									data-cell={`${rowIndex}-${index}`}
									tabindex={-1}
									class={cn(
										'font-mono text-xs focus:ring-1 focus:ring-ring focus:outline-none',
										isMultiline(value) ? 'align-top' : 'whitespace-nowrap'
									)}
									onclick={() => (cursor = { row: rowIndex, col: index })}
									ondblclick={() => startCell(row, index)}
									onkeydown={(event) => handleGridKey(event, rowIndex, index)}
								>
									{#if editing}
										{#if isMultiline(value)}
											<textarea
												class="min-h-16 w-full min-w-56 resize-y border border-input bg-background p-1 font-mono text-xs outline-none"
												bind:value={cellDraft}
												use:focusCell
												onblur={commitCell}
												onkeydown={(event) => handleCellKey(event, true)}></textarea>
										{:else}
											<input
												class="h-6 w-full min-w-28 border border-input bg-background px-1 font-mono text-xs outline-none"
												bind:value={cellDraft}
												use:focusCell
												onblur={commitCell}
												onkeydown={(event) => handleCellKey(event, false)}
											/>
										{/if}
									{:else if value === null}
										<span class="text-muted-foreground">{$t('common.null')}</span>
									{:else if isMultiline(value)}
										<pre
											class="max-h-[480px] w-full overflow-auto text-xs whitespace-pre">{value}</pre>
									{:else}
										{value}
									{/if}
								</Table.Cell>
							{/each}

							<Table.Cell>
								<Button
									variant="ghost"
									size="icon-xs"
									aria-label={$t('dataEditor.deleteRow')}
									onclick={() => deleteRow(row.key)}
								>
									<TrashIcon />
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{/if}
	</div>

	<p class="text-xs text-muted-foreground">
		{$t('dataEditor.editHint')}
	</p>

	<p class="text-xs text-muted-foreground">
		{$t('dataEditor.editorHint')}
	</p>

	{#if editor.truncated}
		<p class="text-xs text-muted-foreground">
			{$t('dataEditor.truncated', { shown: editor.rows.length, total: editor.rowCount })}
		</p>
	{/if}

	{#if target.kind === 'sqlite'}
		<p class="text-xs text-muted-foreground">
			{$t('dataEditor.sqliteNote')}
		</p>
	{/if}
</div>

<AddColumnDialog bind:open={addColumnOpen} existing={editor.columns} onadd={addColumn} />

<style>
	/* let the outer container own scrolling so the table header can stick */
	:global([data-slot='table-container']) {
		overflow: visible;
	}
</style>
