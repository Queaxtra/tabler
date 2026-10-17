<script lang="ts">
	import { onMount } from 'svelte';
	import * as Kbd from '../lib/components/ui/kbd/index.js';
	import { formatShortcut } from '../lib/shortcuts/index.js';

	let { combo, class: className }: { combo: string; class?: string } = $props();

	// resolve platform symbols only after mount to keep the prerendered markup stable
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const tokens = $derived(mounted ? formatShortcut(combo) : []);
</script>

{#if tokens.length > 0}
	<Kbd.Group class={className}>
		{#each tokens as token, index (index)}
			<Kbd.Root>{token}</Kbd.Root>
		{/each}
	</Kbd.Group>
{/if}
