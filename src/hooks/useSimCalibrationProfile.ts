import { useCallback, useState } from "react";
import { loadAppState } from "#/helpers/persistence";
import {
	DEFAULT_SIM_CALIBRATION_PROFILE,
	type SimCalibrationProfile,
} from "#/types/SimCalibrationProfile";

// The exact calibration settings this app shipped with before a convergence investigation found
// them badly mismatched (see SimCalibrationProfile.ts's DEFAULT_SIM_CALIBRATION_PROFILE doc
// comment) - a saved profile carrying exactly these two values was never intentionally
// customized (both defaults changing at once instead of just one), so it's safe to infer "never
// touched this panel" and migrate it forward. A user who deliberately set precisely this pair is
// indistinguishable from that case and gets migrated too - an accepted tradeoff, not a bug.
const OLD_DEFAULT_ITERATIONS = 4000;
const OLD_DEFAULT_MAX_ROUNDS = 5;

/**
 * One-time migration for a profile persisted before the defaults above changed - swaps in the
 * new calibration section while preserving everything else (encounter/healingModel/raidProfile)
 * the user may have customized. Exported for direct unit testing.
 */
export function migrateSimCalibrationProfile(
	profile: SimCalibrationProfile,
): SimCalibrationProfile {
	const isUnmigratedOldDefault =
		profile.calibration.iterations === OLD_DEFAULT_ITERATIONS &&
		profile.calibration.maxRounds === OLD_DEFAULT_MAX_ROUNDS;
	return isUnmigratedOldDefault
		? { ...profile, calibration: DEFAULT_SIM_CALIBRATION_PROFILE.calibration }
		: profile;
}

/**
 * Simple load/update hook for the global sim calibration profile - mirrors useCharacterConfig's
 * shape. Persistence itself is handled by the caller via helpers/persistence.ts (same pattern
 * as classValue/raceValue/talents in routes/index.tsx), not by this hook directly.
 */
export function useSimCalibrationProfile() {
	const [simCalibrationProfile, setSimCalibrationProfile] =
		useState<SimCalibrationProfile>(() => {
			const saved = loadAppState();
			const profile =
				saved?.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE;
			return migrateSimCalibrationProfile(profile);
		});

	// Wrapped in useCallback (rather than passing setSimCalibrationProfile directly) so this stays
	// a stable reference across unrelated re-renders (e.g. solveProgress ticks - see
	// useSolverConfigs.ts's own note on why that matters for SimCalibrationPanel's React.memo).
	const updateSimCalibrationProfile = useCallback(
		(profile: SimCalibrationProfile) => {
			setSimCalibrationProfile(profile);
		},
		[],
	);

	return { simCalibrationProfile, updateSimCalibrationProfile };
}
