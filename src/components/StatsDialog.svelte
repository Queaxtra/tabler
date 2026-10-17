<script lang="ts">
	import LoaderIcon from '~icons/solar/loader-linear';
	import * as Alert from '../lib/components/ui/alert/index.js';
	import * as Dialog from '../lib/components/ui/dialog/index.js';
	import * as Table from '../lib/components/ui/table/index.js';
	import { t } from '../lib/i18n/index.js';
	import type { QueryResult } from '../lib/db/types.js';

	let {
		open = $bindable(false),
		result,
		loading,
		error
	}: {
		open?: boolean;
		result: QueryResult | null;
		loading: boolean;
		error: string;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>{$t('statistics.title')}</Dialog.Title>
			<Dialog.Description>
				{$t('statistics.description')}
			</Dialog.Description>
		</Dialog.Header>

		{#if error}
			<Alert.Root variant="destructive">
				<Alert.Title>{$t('statistics.errorTitle')}</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{:else if loading}
			<div class="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
				<LoaderIcon class="size-4 animate-spin" />
				{$t('statistics.loading')}
			</div>
		{:else if result && result.rows.length > 0}
			<div class="max-h-[60vh] overflow-auto border border-border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							{#each result.columns as column, index (index)}
								<Table.Head class="sticky top-0 z-10 bg-background whitespace-nowrap">
									{column.name}
								</Table.Head>
							{/each}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each result.rows as row, rowIndex (rowIndex)}
							<Table.Row>
								{#each row as cell, cellIndex (cellIndex)}
									<Table.Cell class="font-mono text-xs whitespace-nowrap">
										{#if cell === null}
											<span class="text-muted-foreground">{$t('common.null')}</span>
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
		{:else}
			<p class="py-12 text-center text-sm text-muted-foreground">{$t('statistics.empty')}</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style>
	/* let the outer container own scrolling so the table header can stick */
	:global([data-slot='table-container']) {
		overflow: visible;
	}
</style>
