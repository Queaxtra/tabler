<script lang="ts">
	import ChevronRightIcon from '~icons/solar/alt-arrow-right-linear';
	import TableIcon from '~icons/solar/table-linear';
	import { t } from '../lib/i18n/index.js';
	import { cn } from '../lib/utils.js';
	import type { TableSchema } from '../lib/db/types.js';

	let {
		tables,
		onselect
	}: { tables: TableSchema[]; onselect: (table: TableSchema) => void } = $props();

	let expanded = $state<Record<string, boolean>>({});

	function toggle(qualified: string) {
		expanded[qualified] = !expanded[qualified];
	}
</script>

{#if tables.length === 0}
	<p class="px-1 py-6 text-center text-xs text-muted-foreground">{$t('tableExplorer.empty')}</p>
{:else}
	<ul class="flex flex-col gap-1">
		{#each tables as table (table.qualified)}
			{@const open = expanded[table.qualified]}
			<li class="border border-border">
				<div class="flex items-center gap-1 pr-2">
					<button
						type="button"
						class="flex size-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
						aria-expanded={open}
						aria-label={open ? $t('tableExplorer.collapse') : $t('tableExplorer.expand')}
						onclick={() => toggle(table.qualified)}
					>
						<ChevronRightIcon class={cn('size-3.5 transition-transform', open && 'rotate-90')} />
					</button>

					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
						title={$t('tableExplorer.preview')}
						onclick={() => onselect(table)}
					>
						<TableIcon class="size-3.5 shrink-0 text-muted-foreground" />
						<span class="min-w-0 flex-1 truncate text-sm hover:underline hover:underline-offset-2">
							{table.name}
						</span>
					</button>

					{#if table.rowCount !== null}
						<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
							{table.rowCount}
						</span>
					{/if}
				</div>

				{#if open}
					<div class="border-t border-border py-1">
						{#each table.columns as column, index (index)}
							<div class="flex items-center gap-2 py-0.5 pr-2 pl-8 text-xs">
								<span class="min-w-0 flex-1 truncate">{column.name}</span>
								<span class="shrink-0 font-mono text-[11px] text-muted-foreground">
									{column.type}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
