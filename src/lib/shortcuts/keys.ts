const MAC_PLATFORM = /mac|iphone|ipad|ipod/i;

export function isMac(): boolean {
	if (typeof navigator === 'undefined') return false;
	return MAC_PLATFORM.test(`${navigator.platform} ${navigator.userAgent}`);
}

// split a combo into display tokens so the ui can render one kbd per key
export function formatShortcut(combo: string): string[] {
	return combo.split('+').map(formatToken);
}

function formatToken(token: string): string {
	const value = token.toLowerCase();
	switch (value) {
		case 'mod':
			return isMac() ? '⌘' : 'Ctrl';
		case 'cmd':
		case 'meta':
			return isMac() ? '⌘' : 'Win';
		case 'ctrl':
			return 'Ctrl';
		case 'shift':
			return isMac() ? '⇧' : 'Shift';
		case 'alt':
			return isMac() ? '⌥' : 'Alt';
		case 'enter':
			return isMac() ? '↩' : 'Enter';
		case 'escape':
		case 'esc':
			return 'Esc';
		case 'backspace':
			return isMac() ? '⌫' : 'Backspace';
		default:
			return value.length === 1 || value.includes('?') ? value.toUpperCase() : capitalize(value);
	}
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

// a shifted symbol like "?" already implies shift, so do not require the modifier explicitly
function isShiftOptional(key: string): boolean {
	return key.length === 1 && !/[a-z0-9]/.test(key);
}

export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
	const parts = combo.toLowerCase().split('+');
	const key = parts[parts.length - 1];
	if (event.key.toLowerCase() !== key) return false;

	const needMod = parts.includes('mod');
	const needShift = parts.includes('shift');
	const needAlt = parts.includes('alt');
	const needCtrl = parts.includes('ctrl') || (needMod && !isMac());
	const needMeta = parts.includes('meta') || (needMod && isMac());

	if (event.ctrlKey !== needCtrl) return false;
	if (event.metaKey !== needMeta) return false;
	if (event.altKey !== needAlt) return false;
	if (!isShiftOptional(key) && event.shiftKey !== needShift) return false;
	return true;
}

export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
