import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { activeBuffGroups } from "./activeBuffs";

const profile = () =>
	structuredClone(DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile);

describe("activeBuffGroups", () => {
	it("lists what the default profile applies, grouped by source", () => {
		const groups = activeBuffGroups(profile());
		const titles = groups.map((group) => group.title);
		// Debuffs sit on the TARGET, not the character - grouping is what makes that legible,
		// which the old flat chip row did not.
		expect(titles).toEqual(["Raid", "Party", "Individual", "Debuffs"]);
		const individual = groups.find((g) => g.title === "Individual");
		expect(individual?.labels).toContain("Blessing of Kings");
		expect(individual?.labels).toContain("Blessing of Sanctuary");
	});

	it("omits missing tristates and marks improved ones", () => {
		const raid = profile();
		raid.raidBuffs.thorns = "TristateEffectMissing";
		raid.raidBuffs.giftOfTheWild = "TristateEffectImproved";
		raid.raidBuffs.powerWordFortitude = "TristateEffectRegular";
		const labels =
			activeBuffGroups(raid).find((g) => g.title === "Raid")?.labels ?? [];
		expect(labels).not.toContain("Thorns");
		// "Improved" changes the magnitude, so it earns the extra word; "Regular" is the
		// ordinary case and saying so would just add noise to every row.
		expect(labels).toContain("Gift of the Wild (Improved)");
		expect(labels).toContain("Power Word: Fortitude");
	});

	it("drops a group entirely when nothing in it is active", () => {
		const raid = profile();
		raid.individualBuffs = {
			blessingOfKings: false,
			blessingOfSanctuary: false,
			blessingOfWisdom: "TristateEffectMissing",
			blessingOfMight: "TristateEffectMissing",
		};
		const titles = activeBuffGroups(raid).map((group) => group.title);
		expect(titles).not.toContain("Individual");
	});

	it("renders drums as a readable name", () => {
		const raid = profile();
		raid.partyBuffs.drums = "GreaterDrumsOfBattle";
		const labels =
			activeBuffGroups(raid).find((g) => g.title === "Party")?.labels ?? [];
		expect(labels).toContain("Greater Drums Of Battle");
	});

	it("omits drums when none are set", () => {
		const raid = profile();
		raid.partyBuffs.drums = "DrumsUnknown";
		const labels =
			activeBuffGroups(raid).find((g) => g.title === "Party")?.labels ?? [];
		expect(labels.some((l) => /Drums/.test(l))).toBe(false);
	});
});
