// The fetched item pool, for the main thread.
//
// The solver builds its own copy inside the Worker (see solver.worker.ts); this exists purely
// so the UI can tell the user which pasted ids it does not recognise.
//
// The two copies are genuinely separate. #/data/tbcDatabase memoizes at module scope, and a
// Worker is its own realm, so the Worker repeats both the parse and the adaptation - it only
// shares the HTTP response. That is once per session on each side now that the solver Worker
// persists (it used to be once per config, per solve), which is why this is not worth
// plumbing a copy across postMessage to avoid.
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
