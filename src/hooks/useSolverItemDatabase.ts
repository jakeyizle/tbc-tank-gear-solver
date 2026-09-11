// The fetched item pool, for the main thread.
//
// The solver builds its own copy inside the Worker (see solver.worker.ts); this exists purely
// so the UI can tell the user which pasted ids it does not recognise. Both share one fetch and
// one adaptation via #/data/tbcDatabase's module-level caches, so this costs a promise.
//
// Returns undefined until the database lands. Callers must treat that as "cannot check yet"
// rather than "nothing is known" - see analyzeItemInput's `db` parameter.
import { useEffect, useState } from "react";
import { loadTbcDomainDatabase } from "#/data/tbcDatabase";
import {
	indexItemDatabase,
	type SolverItemDatabase,
} from "#/solver/itemDatabase";

let shared: Promise<SolverItemDatabase> | undefined;

function loadSolverItemDatabase(): Promise<SolverItemDatabase> {
	if (!shared) {
		shared = loadTbcDomainDatabase().then(indexItemDatabase);
	}
	return shared;
}

export function useSolverItemDatabase(): SolverItemDatabase | undefined {
	const [db, setDb] = useState<SolverItemDatabase>();

	useEffect(() => {
		let cancelled = false;
		loadSolverItemDatabase().then((loaded) => {
			if (!cancelled) setDb(loaded);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return db;
}
