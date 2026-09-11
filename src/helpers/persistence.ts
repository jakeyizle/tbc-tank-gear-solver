import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import type { SolveResult, SolverConfiguration } from "#/types/SolverConfig";

const STORAGE_KEY = "appState";
// v2: the sim-as-source-of-truth refactor. Configs lost `abilities`/`talents`/`buffs`, the saved
// blob lost `talents`, and `enabledConsumableIds` changed from hand-written slugs to real game
// item ids - so a v1 config cannot be read as a v2 one.
//
// There is deliberately NO migration. Losing saved configs and results is acceptable here (they
// are a few clicks and one solve away), and MIGRATIONS having no entry for v1 is exactly what
// makes migrate() return null and loadAppState fall through to salvage() - which keeps the one
// thing the user cannot trivially recreate, the pasted gear pool, and defaults everything else.
//
// Writing a migration would be the riskier choice, not the safer one: one that returns a
// malformed config shape makes migrate() return something truthy, so salvage() never runs, the
// bad state loads, and the app crashes on render or solve - then persists and reloads into the
// same crash. Omitting it cannot do that.
const CURRENT_VERSION = 2;

export interface PersistedState {
	version: number;
	itemInput: string;
	classValue: string;
	raceValue: string;
	areEnchantsGemsLocked: boolean;
	excludeUniqueGems: boolean;
	// Optional - absent for saves from before these settings existed; loadAppState's caller
	// falls back to false, same undefined-tolerant pattern as independentConfigs. Split into two
	// independent toggles (rather than one "profession items" toggle) since a character can know
	// one crafting profession without the other.
	excludeJewelcraftingItems?: boolean;
	excludeEnchantingItems?: boolean;
	// Optional - absent for saves from before this setting existed; loadAppState's caller
	// falls back to false/serial mode, same undefined-tolerant pattern as simCalibrationProfile.
	independentConfigs?: boolean;
	phase: number;
	configs: SolverConfiguration[];
	activeConfigId: string;
	solveResults: Array<[string, SolveResult]>;
	activeResultId: string | null;
	// Optional - absent for saves from before this setting existed; loadAppState's caller
	// falls back to DEFAULT_SIM_CALIBRATION_PROFILE (see useSimCalibrationProfile.ts), same
	// undefined-tolerant pattern as objectiveMode/simMetricWeights's earlier migration.
	simCalibrationProfile?: SimCalibrationProfile;
}

type StoredState = Record<string, unknown> & { version?: number };

/**
 * Upgrades a saved blob one version at a time, keyed by the version being upgraded FROM.
 * Empty today (CURRENT_VERSION is 1); the sim-as-source-of-truth work adds `1: migrateV1ToV2`.
 *
 * A migration must be total: it receives whatever shape that version wrote and returns the
 * next version's shape, defaulting anything it cannot carry over. It must never throw for
 * merely-unexpected input - loadAppState treats a throw as "unreadable" and falls back to
 * salvage, which costs the user everything except their pasted gear pool.
 */
const MIGRATIONS: Record<number, (state: StoredState) => StoredState> = {};

function migrate(state: StoredState): StoredState | null {
	let current = state;
	let version = typeof current.version === "number" ? current.version : 0;

	// A blob written by a NEWER build than this one cannot be downgraded; salvage instead.
	if (version > CURRENT_VERSION) return null;

	while (version < CURRENT_VERSION) {
		const step = MIGRATIONS[version];
		if (!step) return null;
		current = step(current);
		version += 1;
		current.version = version;
	}
	return current;
}

/**
 * The one piece of persisted state the user cannot trivially recreate. Everything else
 * (configs, results) is a few clicks or one solve away, so when a blob is unreadable or
 * unmigratable it is still worth handing back just this.
 */
function salvage(state: unknown): Omit<PersistedState, "version"> | null {
	if (state && typeof state === "object") {
		const itemInput = (state as StoredState).itemInput;
		if (typeof itemInput === "string" && itemInput.length > 0) {
			return { itemInput } as Omit<PersistedState, "version">;
		}
	}
	return null;
}

export function saveAppState(state: Omit<PersistedState, "version">): void {
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ version: CURRENT_VERSION, ...state }),
		);
	} catch {
		// quota exceeded or private browsing
	}
}

export function loadAppState(): Omit<PersistedState, "version"> | null {
	let parsed: StoredState | undefined;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			parsed = JSON.parse(raw) as StoredState;
			const migrated = migrate(parsed);
			if (migrated)
				return migrated as unknown as Omit<PersistedState, "version">;
			// Unmigratable (no path, or written by a newer build) - keep the gear pool.
			return salvage(parsed);
		}
		const legacy = localStorage.getItem("itemInput");
		if (legacy) return { itemInput: legacy } as Omit<PersistedState, "version">;
	} catch {
		// corrupt JSON, or a migration that threw despite the contract above
		return salvage(parsed);
	}
	return null;
}
