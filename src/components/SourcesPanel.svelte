<script lang="ts">
	import CodeIcon from '~icons/solar/code-square-linear';
	import DatabaseIcon from '~icons/solar/database-linear';
	import DownloadIcon from '~icons/solar/download-linear';
	import LayersIcon from '~icons/solar/layers-linear';
	import MagnifierIcon from '~icons/solar/magnifier-linear';
	import PlayIcon from '~icons/solar/play-linear';
	import TableIcon from '~icons/solar/table-linear';
	import TrashIcon from '~icons/solar/trash-bin-minimalistic-linear';
	import UploadIcon from '~icons/solar/upload-linear';
	import XIcon from '~icons/solar/close-linear';
	import DropZone from './DropZone.svelte';
	import ShortcutKeys from './ShortcutKeys.svelte';
	import TableExplorer from './TableExplorer.svelte';
	import { Button } from '../lib/components/ui/button/index.js';
	import * as ContextMenu from '../lib/components/ui/context-menu/index.js';
	import * as InputGroup from '../lib/components/ui/input-group/index.js';
	import { t } from '../lib/i18n/index.js';
	import { useShortcuts } from '../lib/shortcuts/index.js';
	import { cn } from '../lib/utils.js';
	import type { FileKind, LoadedSource } from '../lib/files/types.js';
	import type { TableSchema } from '../lib/db/types.js';

	let {
		status,
		files,
		tables,
		activeId,
		busy,
		sessionBusy = false,
		onfiles,
		onselectfile,
		onselect,
		onrunfile,
		ondeletefile,
		ondeleteselected,
		onexportsession,
		onimportsession,
		onreset
	}: {
		status: 'loading' | 'ready' | 'error';
		files: LoadedSource[];
		tables: TableSchema[];
		activeId: string | null;
		busy: boolean;
		sessionBusy?: boolean;
		onfiles: (files: File[]) => void;
		onselectfile: (file: LoadedSource) => void;
		onselect: (table: TableSchema) => void;
		onrunfile: (file: LoadedSource) => void;
		ondeletefile: (file: LoadedSource) => void;
		ondeleteselected: (files: LoadedSource[]) => void;
		onexportsession: () => void;
		onimportsession: (file: File) => void;
		onreset: () => void;
	} = $props();

	const KIND_ICONS: Record<FileKind, typeof TableIcon> = {
		csv: TableIcon,
		tsv: TableIcon,
		json: CodeIcon,
		parquet: LayersIcon,
		sqlite: DatabaseIcon
	};

	let filter = $state('');
	let filterInput = $state<HTMLElement | null>(null);
	let selected = $state<string[]>([]);
	let sessionInput = $state<HTMLInputElement | null>(null);

	const shortcuts = useShortcuts();

	$effect(() => {
		if (!shortcuts) return;
		return shortcuts.register('focus-files', () => filterInput?.focus());
	});

	const disabled = $derived(status !== 'ready');
	const term = $derived(filter.trim().toLowerCase());
	const visibleFiles = $derived(
		term === '' ? files : files.filter((file) => file.name.toLowerCase().includes(term))
	);
	const selectedFiles = $derived(files.filter((file) => selected.includes(file.id)));

	function clearFilter() {
		filter = '';
	}

	function toggleSelect(id: string) {
		selected = selected.includes(id)
			? selected.filter((candidate) => candidate !== id)
			: [...selected, id];
	}

	function removeSelected() {
		ondeleteselected(selectedFiles);
		selected = [];
	}

	function importSession(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		target.value = '';
		if (file) onimportsession(file);
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<aside class="flex min-h-0 flex-col border-b border-border lg:border-r lg:border-b-0">
	<div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
		<DropZone disabled={disabled} {busy} {onfiles} />

		<div class="flex flex-col gap-2">
			<Button
				variant="outline"
				onclick={onexportsession}
				disabled={disabled || sessionBusy || tables.length === 0}
			>
				<DownloadIcon data-icon="inline-start" />
				{$t('sources.exportSession')}
			</Button>
			<Button
				variant="outline"
				onclick={() => sessionInput?.click()}
				disabled={disabled || sessionBusy}
			>
				<UploadIcon data-icon="inline-start" />
				{$t('sources.importSession')}
			</Button>
			<input
				bind:this={sessionInput}
				type="file"
				accept=".zip,application/zip"
				class="sr-only"
				onchange={importSession}
			/>
		</div>

		{#if tables.length > 0}
			<button
				type="button"
				class="self-start text-xs text-destructive underline underline-offset-2 disabled:opacity-50"
				disabled={sessionBusy}
				onclick={onreset}
			>
				{$t('sources.resetDatabase')}
			</button>
		{/if}

		{#if files.length > 0}
			<section class="flex flex-col gap-2">
				<div class="flex items-center justify-between">
					<h2 class="text-xs font-medium text-muted-foreground">{$t('sources.files')}</h2>
					<div class="flex items-center gap-2">
						{#if selected.length > 0}
							<button
								type="button"
								class="text-xs text-destructive underline underline-offset-2"
								onclick={removeSelected}
							>
								{$t('sources.deleteCount', { count: selected.length })}
							</button>
						{/if}
						<span class="text-xs text-muted-foreground tabular-nums">{files.length}</span>
					</div>
				</div>

				<p class="text-xs text-muted-foreground">
					{$t('sources.hint')}
				</p>

				<div class="sticky top-0 z-10 -mx-1 bg-background/80 px-1 py-1 backdrop-blur">
					<InputGroup.Root>
					<InputGroup.Input
						bind:ref={filterInput}
						bind:value={filter}
						placeholder={$t('sources.filterPlaceholder')}
						aria-label={$t('sources.filterPlaceholder')}
					/>
					<InputGroup.Addon>
						<MagnifierIcon class="text-muted-foreground" />
					</InputGroup.Addon>
					<InputGroup.Addon align="inline-end">
						{#if filter}
							<InputGroup.Button
								size="icon-xs"
								aria-label={$t('sources.clearFilter')}
								onclick={clearFilter}
							>
								<XIcon />
							</InputGroup.Button>
						{:else}
							<ShortcutKeys combo="mod+shift+f" />
						{/if}
					</InputGroup.Addon>
				</InputGroup.Root>
				</div>

				{#if visibleFiles.length === 0}
					<p class="py-4 text-center text-xs text-muted-foreground">
						{$t('sources.noMatch', { term: filter })}
					</p>
				{:else}
					<ul class="flex flex-col">
						{#each visibleFiles as file (file.id)}
							{@const Icon = KIND_ICONS[file.kind]}
							{@const active = file.id === activeId}
							<li class="flex items-center gap-1">
								<input
									type="checkbox"
									class="size-3.5 shrink-0"
									checked={selected.includes(file.id)}
									onchange={() => toggleSelect(file.id)}
									aria-label={$t('sources.selectFile', { name: file.name })}
								/>

								<ContextMenu.Root>
									<ContextMenu.Trigger>
										{#snippet child({ props })}
											<button
												{...props}
												type="button"
												class={cn(
													'flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left transition-colors',
													active ? 'bg-muted' : 'hover:bg-muted/50'
												)}
												title={$t('sources.fileTitle')}
												onclick={() => onselectfile(file)}
											>
												<Icon class="size-4 shrink-0 text-muted-foreground" />
												<span class="min-w-0 flex-1 truncate text-sm">{file.name}</span>
												<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
													{formatBytes(file.size)}
												</span>
											</button>
										{/snippet}
									</ContextMenu.Trigger>

									<ContextMenu.Content>
										<ContextMenu.Group>
											<ContextMenu.Item onclick={() => onrunfile(file)}>
												<PlayIcon />
												{$t('sources.runQuery')}
											</ContextMenu.Item>
											<ContextMenu.Item onclick={() => onselectfile(file)}>
												<TableIcon />
												{$t('sources.editTable')}
											</ContextMenu.Item>
										</ContextMenu.Group>
										<ContextMenu.Separator />
										<ContextMenu.Group>
											<ContextMenu.Item variant="destructive" onclick={() => ondeletefile(file)}>
												<TrashIcon />
												{$t('sources.deleteFile')}
											</ContextMenu.Item>
											{#if selected.length > 1}
												<ContextMenu.Item variant="destructive" onclick={removeSelected}>
													<TrashIcon />
													{$t('sources.deleteSelected', { count: selected.length })}
												</ContextMenu.Item>
											{/if}
										</ContextMenu.Group>
									</ContextMenu.Content>
								</ContextMenu.Root>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<section class="flex flex-col gap-2">
			<div class="flex items-center justify-between">
				<h2 class="text-xs font-medium text-muted-foreground">{$t('sources.tables')}</h2>
				{#if tables.length > 0}
					<span class="text-xs text-muted-foreground tabular-nums">{tables.length}</span>
				{/if}
			</div>
			<TableExplorer {tables} {onselect} />
		</section>
	</div>
</aside>
