import { useState } from "react";
import { loadAppState } from "#/helpers/persistence";
import {
	DEFAULT_SIM_CALIBRATION_PROFILE,
	type SimCalibrationProfile,
} from "#/types/SimCalibrationProfile";

/**
 * Simple load/update hook for the global sim calibration profile - mirrors useCharacterConfig's
 * shape. Persistence itself is handled by the caller via helpers/persistence.ts (same pattern
 * as classValue/raceValue/talents in routes/index.tsx), not by this hook directly.
 */
export function useSimCalibrationProfile() {
	const [simCalibrationProfile, setSimCalibrationProfile] =
		useState<SimCalibrationProfile>(() => {
			const saved = loadAppState();
			return saved?.simCalibrationProfile ?? DEFAULT_SIM_CALIBRATION_PROFILE;
		});

	const updateSimCalibrationProfile = (profile: SimCalibrationProfile) => {
		setSimCalibrationProfile(profile);
	};

	return { simCalibrationProfile, updateSimCalibrationProfile };
}
