import type { ShortcutDefinition, ShortcutGroup } from './types.js';

export interface ShortcutGroupEntry {
	group: ShortcutGroup;
	items: ShortcutDefinition[];
}

// group shortcuts for the help dialog, keeping first-seen order
export function groupShortcuts(shortcuts: ShortcutDefinition[]): ShortcutGroupEntry[] {
	const groups: ShortcutGroupEntry[] = [];
	for (const shortcut of shortcuts) {
		let entry = groups.find((candidate) => candidate.group === shortcut.group);
		if (!entry) {
			entry = { group: shortcut.group, items: [] };
			groups.push(entry);
		}
		entry.items.push(shortcut);
	}
	return groups;
}
