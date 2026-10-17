<script lang="ts">
	import UploadIcon from '~icons/solar/upload-linear';
	import { ACCEPT_ATTRIBUTE, FILE_LABELS } from '../lib/files/accept.js';
	import { t } from '../lib/i18n/index.js';
	import { useShortcuts } from '../lib/shortcuts/index.js';
	import { cn } from '../lib/utils.js';

	let {
		disabled = false,
		busy = false,
		onfiles
	}: { disabled?: boolean; busy?: boolean; onfiles: (files: File[]) => void } = $props();

	let input = $state<HTMLInputElement | null>(null);
	let dragging = $state(false);

	const shortcuts = useShortcuts();

	$effect(() => {
		if (!shortcuts) return;
		return shortcuts.register('open-files', () => input?.click());
	});

	function emit(files: FileList | null) {
		if (!files || files.length === 0) return;
		onfiles(Array.from(files));
	}

	function handleInput(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		emit(target.files);
		target.value = '';
	}

	function handleDragOver(event: DragEvent) {
		if (disabled) return;
		event.preventDefault();
		dragging = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		dragging = false;
	}

	function handleDrop(event: DragEvent) {
		if (disabled) return;
		event.preventDefault();
		dragging = false;
		emit(event.dataTransfer?.files ?? null);
	}
</script>

<label
	class={cn(
		'flex cursor-pointer items-center gap-3 border border-dashed px-3 py-3 text-left transition-colors',
		dragging ? 'border-primary bg-muted' : 'border-border hover:bg-muted/50',
		(disabled || busy) && 'pointer-events-none opacity-50'
	)}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<input
		bind:this={input}
		type="file"
		multiple
		accept={ACCEPT_ATTRIBUTE}
		class="sr-only"
		disabled={disabled || busy}
		onchange={handleInput}
	/>
	<span class="flex size-8 shrink-0 items-center justify-center bg-muted">
		{#if busy}
			<UploadIcon class="size-4 animate-pulse" />
		{:else}
			<UploadIcon class="size-4" />
		{/if}
	</span>
	<span class="min-w-0">
		<span class="block text-sm font-medium">
			{dragging ? $t('dropZone.drop') : $t('dropZone.add')}
		</span>
		<span class="block truncate text-xs text-muted-foreground">
			{busy ? $t('dropZone.loading') : FILE_LABELS.join(', ')}
		</span>
	</span>
</label>
