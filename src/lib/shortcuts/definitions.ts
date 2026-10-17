import type { ShortcutDefinition } from './types.js';

// single source of truth for dispatch, labels are translation keys
export const SHORTCUTS: ShortcutDefinition[] = [
	{
		id: 'run-query',
		combo: 'mod+enter',
		label: 'shortcuts.runQuery',
		group: 'query',
		allowInInput: true
	},
	{ id: 'focus-editor', combo: 'mod+e', label: 'shortcuts.focusEditor', group: 'query' },
	{ id: 'open-files', combo: 'mod+o', label: 'shortcuts.openFiles', group: 'data', allowInInput: true },
	{
		id: 'focus-files',
		combo: 'mod+shift+f',
		label: 'shortcuts.focusFiles',
		group: 'data'
	},
	{ id: 'focus-filter', combo: 'mod+f', label: 'shortcuts.focusFilter', group: 'results' },
	{ id: 'undo-edit', combo: 'mod+z', label: 'shortcuts.undoEdit', group: 'general' },
	{ id: 'redo-edit', combo: 'mod+shift+z', label: 'shortcuts.redoEdit', group: 'general' },
	{ id: 'show-shortcuts', combo: '?', label: 'shortcuts.showShortcuts', group: 'general' },
	{
		id: 'close-layer',
		combo: 'escape',
		label: 'shortcuts.blurField',
		group: 'general',
		allowInInput: true
	}
];

export function findShortcut(id: string): ShortcutDefinition | undefined {
	return SHORTCUTS.find((shortcut) => shortcut.id === id);
}
