import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { ENCOUNTER_PRESETS, findMatchingPresetId } from "./encounterPresets";

describe("findMatchingPresetId", () => {
	it("matches each preset's own values back to its id", () => {
		for (const preset of ENCOUNTER_PRESETS) {
			expect(findMatchingPresetId(preset.values)).toBe(preset.id);
		}
	});

	it("returns null when no preset matches", () => {
		const custom = { ...ENCOUNTER_PRESETS[0].values, bossHealth: 123456 };
		expect(findMatchingPresetId(custom)).toBeNull();
	});

	it("maps the shipped default profile's encounter to the default preset", () => {
		expect(
			findMatchingPresetId(DEFAULT_SIM_CALIBRATION_PROFILE.encounter),
		).toBe("default");
	});
});
