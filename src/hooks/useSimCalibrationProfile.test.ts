import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { migrateSimCalibrationProfile } from "./useSimCalibrationProfile";

describe("migrateSimCalibrationProfile", () => {
	it("migrates a profile carrying the exact old shipped defaults (iterations:4000, maxRounds:5)", () => {
		const oldDefaultProfile = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			calibration: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
				iterations: 4000,
				maxRounds: 5,
			},
		};

		const migrated = migrateSimCalibrationProfile(oldDefaultProfile);

		expect(migrated.calibration).toEqual(
			DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
		);
	});

	it("leaves a profile alone if only one of the two old-default values matches", () => {
		const partiallyCustomized = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			calibration: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
				iterations: 4000,
				maxRounds: 8,
			},
		};

		expect(migrateSimCalibrationProfile(partiallyCustomized)).toEqual(
			partiallyCustomized,
		);
	});

	it("leaves a fully customized profile untouched", () => {
		const customized = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			calibration: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
				iterations: 1000,
				maxRounds: 10,
			},
		};

		expect(migrateSimCalibrationProfile(customized)).toEqual(customized);
	});

	it("preserves non-calibration fields (encounter/healingModel/raidProfile) untouched during migration", () => {
		const oldDefaultProfile = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			calibration: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
				iterations: 4000,
				maxRounds: 5,
			},
			encounter: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.encounter,
				duration: 999,
			},
		};

		const migrated = migrateSimCalibrationProfile(oldDefaultProfile);

		expect(migrated.encounter.duration).toBe(999);
	});

	it("leaves an already-current-default profile unchanged (already migrated / new user)", () => {
		expect(
			migrateSimCalibrationProfile(DEFAULT_SIM_CALIBRATION_PROFILE),
		).toEqual(DEFAULT_SIM_CALIBRATION_PROFILE);
	});
});
