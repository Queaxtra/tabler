import { derived, get, writable } from 'svelte/store';
import en from '../translations/en.json';
import tr from '../translations/tr.json';

// add a dictionary here to expose the locale in the picker
const dictionaries: Record<string, unknown> = { en, tr };

// language names stay in their own language, they are not translated
export const LOCALE_LABELS: Record<string, string> = {
	en: 'English',
	tr: 'Türkçe'
};

export const LOCALES = Object.keys(dictionaries);

const STORAGE_KEY = 'tabler.locale';
const DEFAULT_LOCALE = 'en';
const PARAM = /\{(\w+)\}/g;

export type TranslationParams = Record<string, string | number | undefined>;

function detectLocale(): string {
	if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
	const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
	for (const candidate of candidates) {
		const code = candidate?.toLowerCase().split('-')[0];
		if (code && code in dictionaries) return code;
	}
	return DEFAULT_LOCALE;
}

function initialLocale(): string {
	if (typeof localStorage === 'undefined') return detectLocale();
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored && stored in dictionaries ? stored : detectLocale();
}

function lookup(locale: string, key: string): string | undefined {
	const dictionary = (dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE]) as Record<string, unknown>;
	let node: unknown = dictionary;
	for (const part of key.split('.')) {
		if (typeof node !== 'object' || node === null) return undefined;
		node = (node as Record<string, unknown>)[part];
	}
	return typeof node === 'string' ? node : undefined;
}

function format(template: string, params?: TranslationParams): string {
	if (!params) return template;
	return template.replace(PARAM, (match, name: string) =>
		params[name] === undefined ? match : String(params[name])
	);
}

export const locale = writable<string>(initialLocale());

locale.subscribe((value) => {
	if (typeof document !== 'undefined') document.documentElement.lang = value;
	if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, value);
});

// imperative lookups for plain modules, translated as the message is produced
export function translate(key: string, params?: TranslationParams): string {
	return format(lookup(get(locale), key) ?? key, params);
}

// reactive lookups for components, templates read the store as a dollar prefixed call
export const t = derived(
	locale,
	(current) => (key: string, params?: TranslationParams) =>
		format(lookup(current, key) ?? key, params)
);
