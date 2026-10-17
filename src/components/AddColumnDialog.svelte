<script lang="ts">
	import * as Dialog from '../lib/components/ui/dialog/index.js';
	import { Button, buttonVariants } from '../lib/components/ui/button/index.js';
	import { Input } from '../lib/components/ui/input/index.js';
	import * as Select from '../lib/components/ui/select/index.js';
	import { t } from '../lib/i18n/index.js';
	import { COLUMN_TYPES } from '../lib/db/editing.js';

	let {
		open = $bindable(false),
		existing,
		onadd
	}: { open?: boolean; existing: string[]; onadd: (name: string, type: string) => void } = $props();

	let name = $state('');
	let type = $state<string>('VARCHAR');

	const trimmed = $derived(name.trim());
	const duplicate = $derived(
		existing.some((column) => column.toLowerCase() === trimmed.toLowerCase())
	);
	const invalid = $derived(trimmed === '' || duplicate);

	$effect(() => {
		if (open) {
			name = '';
			type = 'VARCHAR';
		}
	});

	function submit() {
		if (invalid) return;
		onadd(trimmed, type);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>{$t('addColumn.title')}</Dialog.Title>
			<Dialog.Description>{$t('addColumn.description')}</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-1.5">
				<label for="column-name" class="text-sm font-medium">{$t('addColumn.name')}</label>
				<Input
					id="column-name"
					bind:value={name}
					placeholder={$t('addColumn.namePlaceholder')}
					aria-invalid={duplicate}
					onkeydown={(event) => {
						if (event.key === 'Enter') submit();
					}}
				/>
				{#if duplicate}
					<p class="text-xs text-destructive">{$t('addColumn.duplicate')}</p>
				{/if}
			</div>

			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{$t('addColumn.type')}</span>
				<Select.Root type="single" bind:value={type}>
					<Select.Trigger class="w-full">
						<Select.Value />
					</Select.Trigger>
					<Select.Content>
						<Select.Group>
							{#each COLUMN_TYPES as option (option)}
								<Select.Item value={option} label={option}>{option}</Select.Item>
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
			</div>
		</div>

		<Dialog.Footer>
			<Dialog.Close class={buttonVariants({ variant: 'outline' })}>
				{$t('common.cancel')}
			</Dialog.Close>
			<Button onclick={submit} disabled={invalid}>{$t('addColumn.submit')}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
