<script lang="ts">
	import ShortcutKeys from './ShortcutKeys.svelte';
	import * as Dialog from '../lib/components/ui/dialog/index.js';
	import { t } from '../lib/i18n/index.js';
	import { SHORTCUTS, groupShortcuts } from '../lib/shortcuts/index.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const groups = groupShortcuts(SHORTCUTS);
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{$t('shortcuts.title')}</Dialog.Title>
			<Dialog.Description>{$t('shortcuts.description')}</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-4">
			{#each groups as entry (entry.group)}
				<section class="flex flex-col gap-2">
					<h3 class="text-xs font-medium text-muted-foreground">
						{$t(`shortcuts.group.${entry.group}`)}
					</h3>
					<ul class="flex flex-col gap-2">
						{#each entry.items as shortcut (shortcut.id)}
							<li class="flex items-center justify-between gap-4 text-sm">
								<span>{$t(shortcut.label)}</span>
								<ShortcutKeys combo={shortcut.combo} />
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
