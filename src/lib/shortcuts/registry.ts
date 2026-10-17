import { SHORTCUTS } from './definitions.js';
import { isTypingTarget, matchesCombo } from './keys.js';
import type { ShortcutHandler } from './types.js';

// one listener handles every shortcut, components only hand in their handler
export class ShortcutRegistry {
	private readonly handlers = new Map<string, ShortcutHandler>();
	private attached = false;
	private enabled = true;

	register(id: string, handler: ShortcutHandler): () => void {
		this.handlers.set(id, handler);
		return () => {
			if (this.handlers.get(id) === handler) this.handlers.delete(id);
		};
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
	}

	attach(): void {
		if (this.attached || typeof window === 'undefined') return;
		window.addEventListener('keydown', this.onKeydown);
		this.attached = true;
	}

	detach(): void {
		if (!this.attached) return;
		window.removeEventListener('keydown', this.onKeydown);
		this.attached = false;
	}

	private readonly onKeydown = (event: KeyboardEvent): void => {
		if (!this.enabled || event.repeat) return;

		for (const definition of SHORTCUTS) {
			const handler = this.handlers.get(definition.id);
			if (!handler || !matchesCombo(event, definition.combo)) continue;
			if (!definition.allowInInput && isTypingTarget(event.target)) continue;

			event.preventDefault();
			handler(event);
			return;
		}
	};
}
