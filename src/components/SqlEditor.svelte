<script lang="ts">
	import { onMount } from 'svelte';
	import EraserIcon from '~icons/solar/eraser-linear';
	import ClockIcon from '~icons/solar/clock-circle-linear';
	import LoaderIcon from '~icons/solar/loader-linear';
	import PlayIcon from '~icons/solar/play-linear';
	import StarBoldIcon from '~icons/solar/star-bold';
	import StarIcon from '~icons/solar/star-linear';
	import ShortcutKeys from './ShortcutKeys.svelte';
	import { Button } from '../lib/components/ui/button/index.js';
	import { Textarea } from '../lib/components/ui/textarea/index.js';
	import {
		clearHistory,
		emptyStore,
		listQueries,
		loadQueryStore,
		recordQuery,
		saveQueryStore,
		toggleFavorite
	} from '../lib/history.js';
	import { useShortcuts } from '../lib/shortcuts/index.js';
	import { t } from '../lib/i18n/index.js';
	import { cn } from '../lib/utils.js';
	import type { QueryStore } from '../lib/history.js';

	let {
		value = $bindable(''),
		disabled = false,
		busy = false,
		hasResult = false,
		hasError = false,
		suggestions = [],
		runRequest = 0,
		onrun,
		onclear
	}: {
		value?: string;
		disabled?: boolean;
		busy?: boolean;
		hasResult?: boolean;
		hasError?: boolean;
		suggestions?: string[];
		runRequest?: number;
		onrun: () => void;
		onclear: () => void;
	} = $props();

	const MAX_SUGGESTIONS = 8;

	let editor = $state<HTMLTextAreaElement | null>(null);
	let matches = $state<string[]>([]);
	let activeIndex = $state(0);
	let store = $state<QueryStore>(emptyStore());
	let historyOpen = $state(false);
	let historyContainer: HTMLElement | null = $state(null);

	function handleWindowClick(event: MouseEvent) {
		if (historyOpen && historyContainer && !historyContainer.contains(event.target as Node)) {
			historyOpen = false;
		}
	}

	const shortcuts = useShortcuts();

	// run needs text to execute, clear needs a result to reset, and an error disables both
	const canRun = $derived(!disabled && !busy && !hasError && value.trim() !== '');
	const canClear = $derived(!disabled && !busy && !hasError && hasResult);
	const queries = $derived(listQueries(store));

	onMount(() => {
		store = loadQueryStore();
	});

	$effect(() => {
		if (!shortcuts) return;
		const offRun = shortcuts.register('run-query', () => query());
		const offFocus = shortcuts.register('focus-editor', () => editor?.focus());
		return () => {
			offRun();
			offFocus();
		};
	});

	function query() {
		if (!canRun) return;
		store = recordQuery(store, value);
		saveQueryStore(store);
		onrun();
	}

	function loadQuery(statement: string) {
		value = statement;
		historyOpen = false;
		queueMicrotask(() => editor?.focus());
	}

	function star(statement: string) {
		store = toggleFavorite(store, statement);
		saveQueryStore(store);
	}

	function clearRecent() {
		store = clearHistory(store);
		saveQueryStore(store);
	}

	// run when the host bumps runRequest, used by the file context menu
	$effect(() => {
		if (runRequest === 0) return;
		void runRequest;
		queueMicrotask(() => query());
	});

	// the word being typed at the caret, used as the autocomplete prefix
	function currentWord(position: number): { word: string; start: number } {
		const before = value.slice(0, position);
		const match = before.match(/[A-Za-z_][A-Za-z0-9_.]*$/);
		const word = match ? match[0] : '';
		return { word, start: position - word.length };
	}

	function updateSuggestions(force = false) {
		if (!editor) return;
		const { word } = currentWord(editor.selectionStart);
		if (!force && word.length === 0) {
			matches = [];
			return;
		}

		const needle = word.toLowerCase();
		matches = suggestions
			.filter((item) => item.toLowerCase().startsWith(needle) && item.toLowerCase() !== needle)
			.slice(0, MAX_SUGGESTIONS);
		activeIndex = 0;
	}

	function applySuggestion(suggestion: string) {
		if (!editor) return;
		const position = editor.selectionStart;
		const { start } = currentWord(position);
		const caret = start + suggestion.length;
		value = value.slice(0, start) + suggestion + value.slice(position);
		matches = [];
		queueMicrotask(() => {
			editor?.setSelectionRange(caret, caret);
			editor?.focus();
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			query();
			return;
		}

		if (event.ctrlKey && event.key === ' ') {
			event.preventDefault();
			updateSuggestions(true);
			return;
		}

		if (matches.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = (activeIndex + 1) % matches.length;
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = (activeIndex - 1 + matches.length) % matches.length;
			return;
		}
		if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			applySuggestion(matches[activeIndex]);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			matches = [];
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />
<div class="flex flex-col gap-2">
	<div class="relative">
		<Textarea
			bind:ref={editor}
			bind:value
			{disabled}
			rows={6}
			spellcheck={false}
			placeholder={$t('editor.placeholder')}
			class="font-mono text-sm"
			oninput={() => updateSuggestions()}
			onblur={() => (matches = [])}
			onkeydown={handleKeydown}
		/>

		{#if matches.length > 0}
			<ul
				class="absolute inset-x-0 top-full z-10 mt-1 max-h-56 overflow-auto border border-border bg-popover p-1 shadow-md"
				role="listbox"
				aria-label={$t('editor.autocomplete')}
			>
				{#each matches as item, index (item)}
					<li role="option" aria-selected={index === activeIndex}>
						<button
							type="button"
							class={cn(
								'flex w-full items-center px-2 py-1 text-left font-mono text-xs',
								index === activeIndex ? 'bg-muted' : 'hover:bg-muted/50'
							)}
							onmousedown={(event) => {
								event.preventDefault();
								applySuggestion(item);
							}}
						>
							{item}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="flex items-center gap-2">
		<Button onclick={query} disabled={!canRun}>
			{#if busy}
				<LoaderIcon data-icon="inline-start" class="animate-spin" />
			{:else}
				<PlayIcon data-icon="inline-start" />
			{/if}
			{$t('editor.run')}
		</Button>
		<Button variant="outline" onclick={onclear} disabled={!canClear}>
			<EraserIcon data-icon="inline-start" />
			{$t('editor.clear')}
		</Button>

		<div class="relative" bind:this={historyContainer}>
			<Button
				variant="outline"
				onclick={() => (historyOpen = !historyOpen)}
				aria-expanded={historyOpen}
			>
				<ClockIcon data-icon="inline-start" />
				{$t('editor.history')}
			</Button>

			{#if historyOpen}
				<div
					class="absolute top-full left-0 z-20 mt-1 w-80 border border-border bg-popover p-1 shadow-md"
				>
					<div class="flex items-center justify-between px-2 py-1">
						<span class="text-xs font-medium text-muted-foreground">{$t('editor.recent')}</span>
						{#if store.history.length > 0}
							<button
								type="button"
								class="text-xs text-destructive underline underline-offset-2"
								onclick={clearRecent}
							>
								{$t('common.clear')}
							</button>
						{/if}
					</div>

					{#if queries.length === 0}
						<p class="px-2 py-4 text-center text-xs text-muted-foreground">
							{$t('editor.historyEmpty')}
						</p>
					{:else}
						<ul class="max-h-64 overflow-auto">
							{#each queries as statement (statement)}
								{@const favorite = store.favorites.includes(statement)}
								<li class="flex items-start gap-1">
									<button
										type="button"
										class="min-w-0 flex-1 truncate px-2 py-1 text-left font-mono text-xs hover:bg-muted/50"
										title={statement}
										onclick={() => loadQuery(statement)}
									>
										{statement.replace(/\s+/g, ' ')}
									</button>
									<button
										type="button"
										class={cn(
											'shrink-0 p-1 text-muted-foreground hover:text-foreground',
											favorite && 'text-foreground'
										)}
										aria-label={favorite ? $t('editor.removeFavourite') : $t('editor.addFavourite')}
										title={favorite ? $t('editor.removeFavourite') : $t('editor.addFavourite')}
										onclick={() => star(statement)}
									>
										{#if favorite}
											<StarBoldIcon class="size-3.5" />
										{:else}
											<StarIcon class="size-3.5" />
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</div>
		<span class="ml-auto hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
			{$t('editor.runWith')}
			<ShortcutKeys combo="mod+enter" />
		</span>
	</div>
</div>
