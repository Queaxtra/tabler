<script lang="ts">
	import DownloadIcon from '~icons/solar/download-linear';
	import LoaderIcon from '~icons/solar/loader-linear';
	import * as Alert from '../lib/components/ui/alert/index.js';
	import { Button, buttonVariants } from '../lib/components/ui/button/index.js';
	import * as Dialog from '../lib/components/ui/dialog/index.js';
	import * as Select from '../lib/components/ui/select/index.js';
	import { t } from '../lib/i18n/index.js';
	import type { ExportFormatKey } from '../lib/db/types.js';

	let {
		open = $bindable(false),
		busy = false,
		error = '',
		onexport
	}: {
		open?: boolean;
		busy?: boolean;
		error?: string;
		onexport: (format: ExportFormatKey) => void;
	} = $props();

	// file formats are names, not copy, they stay untranslated
	const FORMATS: { value: ExportFormatKey; label: string }[] = [
		{ value: 'csv', label: 'CSV' },
		{ value: 'json', label: 'JSON' },
		{ value: 'parquet', label: 'Parquet' },
		{ value: 'xlsx', label: 'Excel (xlsx)' }
	];

	let format = $state<ExportFormatKey>('csv');

	$effect(() => {
		if (open) format = 'csv';
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>{$t('export.title')}</Dialog.Title>
			<Dialog.Description>{$t('export.description')}</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-1.5">
			<span class="text-sm font-medium">{$t('export.format')}</span>
			<Select.Root type="single" bind:value={format}>
				<Select.Trigger class="w-full">
					<Select.Value />
				</Select.Trigger>
				<Select.Content>
					<Select.Group>
						{#each FORMATS as option (option.value)}
							<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
						{/each}
					</Select.Group>
				</Select.Content>
			</Select.Root>
		</div>

		{#if error}
			<Alert.Root variant="destructive">
				<Alert.Title>{$t('export.errorTitle')}</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		<Dialog.Footer>
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>
				{$t('common.cancel')}
			</Dialog.Close>
			<Button onclick={() => onexport(format)} disabled={busy}>
				{#if busy}
					<LoaderIcon data-icon="inline-start" class="animate-spin" />
				{:else}
					<DownloadIcon data-icon="inline-start" />
				{/if}
				{$t('common.download')}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
