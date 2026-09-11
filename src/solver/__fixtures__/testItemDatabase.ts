// The real item/gem/enchant pool, for tests that need one.
//
// Since the Phase 3 cutover the solver takes its pool as a parameter instead of importing
// bundled JSON, so tests have to supply one. Reading the vendored db.json straight off disk is
// both the most faithful option and a cheap one (3MB, ~30ms to parse, memoized below) - and it
// means gem-pruning and phase-filter tests still see the full 214-gem / 143-enchant pool rather
// than a curated subset that could quietly diverge from what ships.
import fs from "node:fs";
import path from "node:path";
import { adaptDatabase, type RawTbcDatabase } from "#/data/tbcDatabase";
import { indexItemDatabase, type SolverItemDatabase } from "../itemDatabase";

const DB_PATH = path.resolve(
	__dirname,
	"../../../vendor/tbc-sim/assets/database/db.json",
);

let cached: SolverItemDatabase | undefined;

export function testItemDatabase(): SolverItemDatabase {
	if (!cached) {
		const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as RawTbcDatabase;
		cached = indexItemDatabase(adaptDatabase(raw));
	}
	return cached;
}

export const TEST_ITEM_DATABASE: SolverItemDatabase = testItemDatabase();
