<script lang="ts">
	import { onDestroy } from 'svelte';
	import ArrowDownIcon from '~icons/solar/alt-arrow-down-linear';
	import ArrowUpIcon from '~icons/solar/alt-arrow-up-linear';
	import CheckIcon from '~icons/solar/check-circle-linear';
	import ChartIcon from '~icons/solar/chart-2-linear';
	import CopyIcon from '~icons/solar/copy-linear';
	import DownloadIcon from '~icons/solar/download-linear';
	import FilterIcon from '~icons/solar/filter-linear';
	import LoaderIcon from '~icons/solar/loader-linear';
	import MagnifierIcon from '~icons/solar/magnifier-linear';
	import SearchXIcon from '~icons/solar/magnifier-zoom-out-linear';
	import TableIcon from '~icons/solar/table-linear';
	import XIcon from '~icons/solar/close-linear';
	import ShortcutKeys from './ShortcutKeys.svelte';
	import { Button } from '../lib/components/ui/button/index.js';
	import * as Dialog from '../lib/components/ui/dialog/index.js';
	import * as Empty from '../lib/components/ui/empty/index.js';
	import * as InputGroup from '../lib/components/ui/input-group/index.js';
	import * as Table from '../lib/components/ui/table/index.js';
	import { toCsv } from '../lib/db/csv.js';
	import { t } from '../lib/i18n/index.js';
	import { useShortcuts } from '../lib/shortcuts/index.js';
	import { cn } from '../lib/utils.js';
	import type { QueryResult, QueryView, SortSpec } from '../lib/db/types.js';

	let {
		result,
		runToken = 0,
		refreshing = false,
		onrefine,
		onstats,
		onexport
	}: {
		result: QueryResult | null;
		runToken?: number;
		refreshing?: boolean;
		onrefine: (view: QueryView, columns: string[]) => void;
		onstats: () => void;
		onexport: () => void;
	} = $props();

	let view = $state<QueryView>({ search: '', sorts: [], filters: [] });
	let openFilter = $state<string | null>(null);
	let filterDraft = $state('');
	let detail = $state<number | null>(null);
	let detailOpen = $state(false);
	let searchInput = $state<HTMLElement | null>(null);
	let refineTimer: ReturnType<typeof setTimeout> | undefined;
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	let copied = $state(false);

	const shortcuts = useShortcuts();

	$effect(() => {
		if (!shortcuts) return;
		return shortcuts.register('focus-filter', () => searchInput?.focus());
	});

	// a fresh run clears every refinement, without re-querying because the run already did
	$effect(() => {
		void runToken;
		view = { search: '', sorts: [], filters: [] };
		openFilter = null;
		detail = null;
		detailOpen = false;
	});

	// keep the detail index in sync when the dialog closes
	$effect(() => {
		if (!detailOpen) detail = null;
	});

	function openDetail(index: number) {
		detail = index;
		detailOpen = true;
	}

	onDestroy(() => {
		clearTimeout(refineTimer);
		clearTimeout(copyTimer);
	});

	const columns = $derived(result?.columns.map((column) => column.name) ?? []);
	const rows = $derived(result?.rows ?? []);
	const term = $derived(view.search.trim());

	function scheduleRefine(immediate = false) {
		clearTimeout(refineTimer);
		if (immediate) {
			onrefine(view, columns);
			return;
		}
		refineTimer = setTimeout(() => onrefine(view, columns), 250);
	}

	function sortOf(column: string): SortSpec | undefined {
		return view.sorts.find((sort) => sort.column === column);
	}

	function toggleSort(column: string) {
		const existing = sortOf(column);
		const sorts: SortSpec[] = !existing
			? [{ column, desc: false }]
			: existing.desc
				? []
				: [{ column, desc: true }];
		view = { ...view, sorts };
		scheduleRefine(true);
	}

	function filterValue(column: string): string {
		return view.filters.find((filter) => filter.column === column)?.term ?? '';
	}

	function openFilterFor(column: string) {
		openFilter = openFilter === column ? null : column;
		filterDraft = filterValue(column);
	}

	function applyFilter() {
		if (openFilter === null) return;
		const column = openFilter;
		const filters = view.filters.filter((filter) => filter.column !== column);
		if (filterDraft.trim()) filters.push({ column, term: filterDraft });
		view = { ...view, filters };
		scheduleRefine();
	}

	function clearFilter(column: string) {
		view = { ...view, filters: view.filters.filter((filter) => filter.column !== column) };
		openFilter = null;
		filterDraft = '';
		scheduleRefine(true);
	}

	function clearSearch() {
		view = { ...view, search: '' };
		scheduleRefine(true);
	}

	function isJson(cell: string | null): boolean {
		return cell !== null && cell.includes('\n');
	}

	function detailEntries(index: number): { column: string; value: string | null }[] {
		const active = result;
		if (!active) return [];
		return active.columns.map((column, position) => ({
			column: column.name,
			value: active.rows[index]?.[position] ?? null
		}));
	}

	async function copyCsv() {
		if (!result) return;
		const csv = toCsv(columns, rows);
		try {
			await navigator.clipboard.writeText(csv);
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => {
				copied = false;
			}, 1500);
		} catch {
			copied = false;
		}
	}
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
	{#if result}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span class="font-medium text-foreground">
					{$t('results.rows', { count: result.rowCount })}
				</span>
				<span class="tabular-nums">{result.durationMs.toFixed(0)} ms</span>
				{#if view.sorts.length > 0 || view.filters.length > 0 || term}
					<button
						type="button"
						class="underline underline-offset-2 hover:text-foreground"
						onclick={() => {
							view = { search: '', sorts: [], filters: [] };
							openFilter = null;
							scheduleRefine(true);
						}}
					>
						{$t('results.clearRefinements')}
					</button>
				{/if}
				{#if result.truncated}
					<span>{$t('results.truncated')}</span>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<InputGroup.Root class="max-w-[220px]">
					<InputGroup.Input
						bind:ref={searchInput}
						bind:value={view.search}
						oninput={() => scheduleRefine()}
						onkeydown={(event) => {
							if (event.key === 'Enter') scheduleRefine(true);
						}}
						placeholder={$t('results.searchPlaceholder')}
						aria-label={$t('results.searchPlaceholder')}
					/>
					<InputGroup.Addon>
						{#if refreshing}
							<LoaderIcon class="animate-spin" />
						{:else}
							<MagnifierIcon class="text-muted-foreground" />
						{/if}
					</InputGroup.Addon>
					<InputGroup.Addon align="inline-end">
						{#if view.search}
							<InputGroup.Button
								size="icon-xs"
								aria-label={$t('results.clearSearch')}
								onclick={clearSearch}
							>
								<XIcon />
							</InputGroup.Button>
						{:else}
							<ShortcutKeys combo="mod+f" />
						{/if}
					</InputGroup.Addon>
				</InputGroup.Root>

				<Button variant="outline" size="sm" onclick={onstats}>
					<ChartIcon data-icon="inline-start" />
					<span class="hidden sm:inline">{$t('results.statistics')}</span>
					<span class="sm:hidden">{$t('results.statisticsShort')}</span>
				</Button>

				<Button variant="outline" size="sm" onclick={onexport}>
					<DownloadIcon data-icon="inline-start" />
					{$t('results.export')}
				</Button>

				<Button variant="outline" size="sm" onclick={copyCsv} disabled={rows.length === 0}>
					{#if copied}
						<CheckIcon data-icon="inline-start" />
					{:else}
						<CopyIcon data-icon="inline-start" />
					{/if}
					<span class="hidden sm:inline">
						{copied ? $t('results.copied') : $t('results.copy')}
					</span>
				</Button>
			</div>
		</div>

		{#if rows.length === 0}
			<Empty.Root class="border border-dashed">
				<Empty.Header>
					<Empty.Media variant="icon">
						<SearchXIcon />
					</Empty.Media>
					{#if term || view.filters.length > 0}
						<Empty.Title>{$t('results.emptyMatchTitle')}</Empty.Title>
						<Empty.Description>{$t('results.emptyMatchBody')}</Empty.Description>
					{:else}
						<Empty.Title>{$t('results.emptyTitle')}</Empty.Title>
						<Empty.Description>{$t('results.emptyBody')}</Empty.Description>
					{/if}
				</Empty.Header>
			</Empty.Root>
		{:else}
			<div class="max-h-[60vh] min-h-0 flex-1 overflow-auto border border-border lg:max-h-none">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							{#each result.columns as column, index (index)}
								{@const sort = sortOf(column.name)}
								{@const filtered = filterValue(column.name) !== ''}
								<Table.Head class="sticky top-0 z-10 bg-background align-top whitespace-nowrap">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<button
												type="button"
												class="flex items-baseline gap-1 text-left"
												title={$t('results.sortColumn')}
												onclick={() => toggleSort(column.name)}
											>
												{column.name}
												<span class="font-normal text-muted-foreground">{column.type}</span>
												{#if sort}
													{#if sort.desc}
														<ArrowDownIcon class="size-3.5 self-center" />
													{:else}
														<ArrowUpIcon class="size-3.5 self-center" />
													{/if}
												{/if}
											</button>
											<button
												type="button"
												class={cn(
													'ml-auto text-muted-foreground hover:text-foreground',
													filtered && 'text-foreground'
												)}
												aria-label={$t('results.filterColumn')}
												onclick={() => openFilterFor(column.name)}
											>
												<FilterIcon class="size-3.5" />
											</button>
										</div>

										{#if openFilter === column.name}
											<InputGroup.Root class="h-7">
												<InputGroup.Input
													class="h-7 text-xs"
													bind:value={filterDraft}
													placeholder={$t('results.filterValue')}
													oninput={applyFilter}
													onkeydown={(event) => {
														if (event.key === 'Enter') {
															applyFilter();
															scheduleRefine(true);
														}
													}}
												/>
												<InputGroup.Addon align="inline-end">
													<InputGroup.Button
														size="icon-xs"
														aria-label={$t('results.clearFilter')}
														onclick={() => clearFilter(column.name)}
													>
														<XIcon />
													</InputGroup.Button>
												</InputGroup.Addon>
											</InputGroup.Root>
										{/if}
									</div>
								</Table.Head>
							{/each}
						</Table.Row>
					</Table.Header>

					<Table.Body>
						{#each rows as row, rowIndex (rowIndex)}
							<Table.Row class="cursor-pointer" onclick={() => openDetail(rowIndex)}>
								{#each row as cell, cellIndex (cellIndex)}
									<Table.Cell
										class={cn(
											'font-mono text-xs',
											isJson(cell) ? 'align-top' : 'whitespace-nowrap'
										)}
									>
										{#if cell === null}
											<span class="text-muted-foreground">{$t('common.null')}</span>
										{:else if isJson(cell)}
											<pre
												class="max-h-[480px] w-full overflow-auto text-xs whitespace-pre">{cell}</pre>
										{:else}
											{cell}
										{/if}
									</Table.Cell>
								{/each}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		{/if}
	{:else}
		<Empty.Root class="border border-dashed">
			<Empty.Header>
				<Empty.Media variant="icon">
					<TableIcon />
				</Empty.Media>
				<Empty.Title>{$t('results.idleTitle')}</Empty.Title>
				<Empty.Description>
					{$t('results.idleBody')}
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{/if}
</div>

<Dialog.Root bind:open={detailOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title
				>{$t('results.rowTitle', { number: detail !== null ? detail + 1 : '' })}</Dialog.Title
			>
			<Dialog.Description>{$t('results.rowDescription')}</Dialog.Description>
		</Dialog.Header>

		<div class="max-h-[60vh] overflow-auto border border-border">
			<dl class="divide-y divide-border">
				{#each detail !== null ? detailEntries(detail) : [] as entry (entry.column)}
					<div class="grid grid-cols-[140px_1fr] gap-3 p-2">
						<dt class="truncate text-sm font-medium">{entry.column}</dt>
						<dd class="min-w-0">
							{#if entry.value === null}
								<span class="text-sm text-muted-foreground">{$t('common.null')}</span>
							{:else if isJson(entry.value)}
								<pre
									class="max-h-60 overflow-auto font-mono text-xs whitespace-pre">{entry.value}</pre>
							{:else}
								<span class="font-mono text-xs break-words">{entry.value}</span>
							{/if}
						</dd>
					</div>
				{/each}
			</dl>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* let the outer container own scrolling so the table header can stick */
	:global([data-slot='table-container']) {
		overflow: visible;
	}
</style>
