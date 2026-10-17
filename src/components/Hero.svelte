<script lang="ts">
	import { onMount } from 'svelte';
	import GithubIcon from '~icons/simple-icons/github';
	import XIcon from '~icons/simple-icons/x';
	import KeyboardIcon from '~icons/solar/keyboard-linear';
	import SunIcon from '~icons/solar/sun-linear';
	import MoonIcon from '~icons/solar/moon-linear';
	import GlobeIcon from '~icons/solar/global-linear';
	import { Button } from '../lib/components/ui/button/index.js';
	import * as Select from '../lib/components/ui/select/index.js';
	import { LOCALES, LOCALE_LABELS, locale, t } from '../lib/i18n/index.js';

	let { onshortcuts }: { onshortcuts: () => void } = $props();

	let dark = $state(false);

	onMount(() => {
		const stored = localStorage.getItem('tabler.theme');
		const isDark =
			stored === 'dark' ||
			(stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
		dark = isDark;
		document.documentElement.classList.toggle('dark', isDark);
	});

	function toggleTheme() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		localStorage.setItem('tabler.theme', dark ? 'dark' : 'light');
	}
</script>

<header class="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
	<span class="text-base font-semibold tracking-tight">Tabler</span>
	<div class="flex-1"></div>

	<div class="flex items-center gap-1">
		<Button variant="ghost" size="icon-sm" onclick={toggleTheme} aria-label={$t('hero.theme')}>
			{#if dark}
				<SunIcon />
			{:else}
				<MoonIcon />
			{/if}
		</Button>

		<Select.Root type="single" bind:value={$locale}>
			<Select.Trigger
				class="h-8 w-8 !justify-center border-transparent bg-transparent px-0 shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent [&>svg:last-child]:hidden"
				aria-label={$t('hero.language')}
			>
				<GlobeIcon />
			</Select.Trigger>
			<Select.Content>
				{#each LOCALES as option (option)}
					<Select.Item value={option} label={LOCALE_LABELS[option] ?? option}>
						{LOCALE_LABELS[option] ?? option}
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Button
			variant="ghost"
			size="icon-sm"
			href="https://github.com/queaxtra/tabler"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('hero.repository')}
		>
			<GithubIcon />
		</Button>
		<Button
			variant="ghost"
			size="icon-sm"
			href="https://x.com/queaxtra"
			target="_blank"
			rel="noopener noreferrer"
			aria-label={$t('hero.profile')}
		>
			<XIcon />
		</Button>
	</div>

	<Button variant="default" size="sm" onclick={onshortcuts} aria-label={$t('hero.shortcutsAria')}>
		<KeyboardIcon />
		<span class="hidden sm:inline">{$t('hero.shortcuts')}</span>
	</Button>
</header>
