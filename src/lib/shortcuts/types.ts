export type ShortcutGroup = 'query' | 'data' | 'results' | 'general';

export interface ShortcutDefinition {
	id: string;
	combo: string;
	// translation key, resolved by the shortcuts dialog
	label: string;
	group: ShortcutGroup;
	// shortcuts without this flag are ignored while a text field has focus
	allowInInput?: boolean;
}

export type ShortcutHandler = (event: KeyboardEvent) => void;
