import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB, DuckDBBundles } from '@duckdb/duckdb-wasm';
import { translate } from '../i18n/index.js';
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

const BUNDLES: DuckDBBundles = {
	mvp: { mainModule: duckdbMvpWasm, mainWorker: mvpWorker },
	eh: { mainModule: duckdbEhWasm, mainWorker: ehWorker }
};

const QUERY_CONFIG = {
	castBigIntToDouble: false,
	castDecimalToDouble: false,
	castTimestampToDate: true
};

export async function instantiateDatabase(): Promise<AsyncDuckDB> {
	const bundle = await duckdb.selectBundle(BUNDLES);
	if (!bundle.mainWorker) throw new Error(translate('errors.workerBundle'));

	const worker = new Worker(bundle.mainWorker);
	const database = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
	await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
	await database.open({ path: ':memory:', query: QUERY_CONFIG });

	return database;
}