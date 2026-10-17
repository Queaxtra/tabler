<script lang="ts">
	import DataEditor from './DataEditor.svelte';
	import ExportDialog from './ExportDialog.svelte';
	import ResultGrid from './ResultGrid.svelte';
	import SqlEditor from './SqlEditor.svelte';
	import StatsDialog from './StatsDialog.svelte';
	import * as Alert from '../lib/components/ui/alert/index.js';
	import { downloadBlob } from '../lib/files/download.js';
	import { t } from '../lib/i18n/index.js';
	import type { EditingTarget } from '../lib/db/editing.js';
	import type { ExportFormatKey, QueryResult, QueryView } from '../lib/db/types.js';
	import type { QueryEngine } from '../lib/db/engine.js';

	let {
		status,
		engine,
		editing,
		sql = $bindable(''),
		result,
		runToken = 0,
		refreshing,
		suggestions = [],
		runRequest = 0,
		error,
		busy,
		onrun,
		onrefine,
		onclear,
		oncloseeditor,
		onschemachanged
	}: {
		status: 'loading' | 'ready' | 'error';
		engine: QueryEngine | null;
		editing: EditingTarget | null;
		sql?: string;
		result: QueryResult | null;
		runToken?: number;
		refreshing: boolean;
		suggestions?: string[];
		runRequest?: number;
		error: string;
		busy: boolean;
		onrun: () => void;
		onrefine: (view: QueryView, columns: string[]) => void;
		onclear: () => void;
		oncloseeditor: () => void;
		onschemachanged: () => void | Promise<void>;
	} = $props();

	const disabled = $derived(status !== 'ready');

	let statsOpen = $state(false);
	let statsResult = $state<QueryResult | null>(null);
	let statsLoading = $state(false);
	let statsError = $state('');

	let exportOpen = $state(false);
	let exporting = $state(false);
	let exportError = $state('');

	async function openStats() {
		const active = engine;
		if (!active) return;

		statsOpen = true;
		statsLoading = true;
		statsError = '';
		statsResult = null;
		try {
			statsResult = await active.summarize(sql);
		} catch (failure) {
			statsError = message(failure);
		} finally {
			statsLoading = false;
		}
	}

	async function exportResult(format: ExportFormatKey) {
		const active = engine;
		if (!active) return;

		exporting = true;
		exportError = '';
		try {
			const file = await active.exportQuery(sql, format, 'query-result');
			downloadBlob(file.blob, file.filename);
			exportOpen = false;
		} catch (failure) {
			exportError = message(failure);
		} finally {
			exporting = false;
		}
	}

	function message(failure: unknown): string {
		return failure instanceof Error ? failure.message : String(failure);
	}
</script>

<section class="flex min-h-0 flex-col">
	<div class="shrink-0 border-b border-border p-4">
		<SqlEditor
			bind:value={sql}
			{disabled}
			{busy}
			{suggestions}
			{runRequest}
			hasResult={result !== null}
			hasError={error !== ''}
			{onrun}
			{onclear}
		/>
	</div>

	<div class="flex min-h-0 flex-1 flex-col p-4">
		{#if error}
			<Alert.Root variant="destructive" class="mb-3">
				<Alert.Title>{$t('results.queryFailed')}</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if editing && engine}
			{#key editing.table}
				<DataEditor {engine} target={editing} onclose={oncloseeditor} onchanged={onschemachanged} />
			{/key}
		{:else}
			<ResultGrid
				{result}
				{runToken}
				{refreshing}
				{onrefine}
				onstats={openStats}
				onexport={() => (exportOpen = true)}
			/>
		{/if}
	</div>
</section>

<StatsDialog bind:open={statsOpen} result={statsResult} loading={statsLoading} error={statsError} />
<ExportDialog bind:open={exportOpen} busy={exporting} error={exportError} onexport={exportResult} />
