import { getContext, setContext } from 'svelte';
import type { ShortcutRegistry } from './registry.js';

const CONTEXT_KEY = Symbol('shortcuts');

export function provideShortcuts(registry: ShortcutRegistry): void {
	setContext(CONTEXT_KEY, registry);
}

// returns null outside a provider so reusable components stay usable on their own
export function useShortcuts(): ShortcutRegistry | null {
	return getContext<ShortcutRegistry | undefined>(CONTEXT_KEY) ?? null;
}
