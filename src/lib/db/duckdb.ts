import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB, DuckDBBundles } from '@duckdb/duckdb-wasm';
import { translate } from '../i18n/index.js';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';

// the wasm binaries are 34 MiB and 39 MiB, above the 25 MiB per file limit Cloudflare enforces on
// uploaded assets, so they are fetched from the jsdelivr CDN at runtime instead of being bundled
// the workers stay local so they are served same-origin
const CDN = duckdb.getJsDelivrBundles();

const BUNDLES: DuckDBBundles = {
	mvp: { mainModule: CDN.mvp!.mainModule, mainWorker: mvpWorker },
	eh: { mainModule: CDN.eh!.mainModule, mainWorker: ehWorker }
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
