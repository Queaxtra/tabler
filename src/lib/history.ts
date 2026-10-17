// query history and favourites, kept in local storage so they survive a reload

const STORAGE_KEY = 'tabler.queries';
const HISTORY_LIMIT = 50;

export interface QueryStore {
	history: string[];
	favorites: string[];
}

export function emptyStore(): QueryStore {
	return { history: [], favorites: [] };
}

export function loadQueryStore(): QueryStore {
	const raw = read();
	if (raw === null) return emptyStore();

	try {
		const parsed = JSON.parse(raw) as Partial<QueryStore>;
		return { history: clean(parsed.history), favorites: clean(parsed.favorites) };
	} catch {
		return emptyStore();
	}
}

export function saveQueryStore(store: QueryStore): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
	} catch {
		// quota or privacy mode may block storage, history is a convenience so the failure is ignored
	}
}

// newest statement first, a repeated statement moves back to the top
export function recordQuery(store: QueryStore, sql: string): QueryStore {
	const statement = sql.trim();
	if (statement === '') return store;

	const history = [statement, ...store.history.filter((entry) => entry !== statement)].slice(
		0,
		HISTORY_LIMIT
	);
	return { ...store, history };
}

export function toggleFavorite(store: QueryStore, sql: string): QueryStore {
	const statement = sql.trim();
	if (statement === '') return store;

	const favorites = store.favorites.includes(statement)
		? store.favorites.filter((entry) => entry !== statement)
		: [statement, ...store.favorites];
	return { ...store, favorites };
}

export function clearHistory(store: QueryStore): QueryStore {
	return { ...store, history: [] };
}

// favourites first, then the remaining history, without duplicates
export function listQueries(store: QueryStore): string[] {
	return [...store.favorites, ...store.history.filter((entry) => !store.favorites.includes(entry))];
}

function clean(values: unknown): string[] {
	if (!Array.isArray(values)) return [];
	return values.filter(
		(value): value is string => typeof value === 'string' && value.trim() !== ''
	);
}

function read(): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}
