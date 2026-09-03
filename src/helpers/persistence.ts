import type { ModifierSource } from "#/solver/types";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import type { SolveResult, SolverConfiguration } from "#/types/SolverConfig";

const STORAGE_KEY = "appState";
const CURRENT_VERSION = 1;

export interface PersistedState {
	version: typeof CURRENT_VERSION;
	itemInput: string;
	classValue: string;
	raceValue: string;
	talents: ModifierSource[];
	areEnchantsGemsLocked: boolean;
	excludeUniqueGems: boolean;
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
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as PersistedState;
			if (parsed.version !== CURRENT_VERSION) return null;
			return parsed;
		}
		const legacy = localStorage.getItem("itemInput");
		if (legacy) return { itemInput: legacy } as Omit<PersistedState, "version">;
	} catch {
		// corrupt JSON
	}
	return null;
}
