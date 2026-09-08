import { describe, expect, it } from "vitest";
import type { RaidProfileSettings } from "#/types/SimCalibrationProfile";
import { raidProfileToModifierSources } from "./raidProfileToModifierSources";

const EMPTY_RAID_PROFILE: RaidProfileSettings["raidBuffs"] = {
	bloodlust: false,
	divineSpirit: "TristateEffectMissing",
	arcaneBrilliance: false,
	giftOfTheWild: "TristateEffectMissing",
	powerWordFortitude: "TristateEffectMissing",
	shadowProtection: false,
	thorns: "TristateEffectMissing",
};

const EMPTY_PARTY_BUFFS: RaidProfileSettings["partyBuffs"] = {
	manaSpringTotem: "TristateEffectMissing",
	wrathOfAirTotem: "TristateEffectMissing",
	graceOfAirTotem: "TristateEffectMissing",
	strengthOfEarthTotem: "TristateEffectMissing",
	windfuryTotem: "TristateEffectMissing",
	battleShout: "TristateEffectMissing",
	drums: "DrumsUnknown",
	sanctityAura: "TristateEffectMissing",
};

const EMPTY_INDIVIDUAL_BUFFS: RaidProfileSettings["individualBuffs"] = {
	blessingOfKings: false,
	blessingOfWisdom: "TristateEffectMissing",
	blessingOfMight: "TristateEffectMissing",
	blessingOfSanctuary: false,
};

function makeRaidProfile(
	overrides: Partial<{
		raidBuffs: Partial<RaidProfileSettings["raidBuffs"]>;
		partyBuffs: Partial<RaidProfileSettings["partyBuffs"]>;
		individualBuffs: Partial<RaidProfileSettings["individualBuffs"]>;
	}>,
): RaidProfileSettings {
	return {
		talentsString: "",
		raidBuffs: { ...EMPTY_RAID_PROFILE, ...overrides.raidBuffs },
		partyBuffs: { ...EMPTY_PARTY_BUFFS, ...overrides.partyBuffs },
		individualBuffs: { ...EMPTY_INDIVIDUAL_BUFFS, ...overrides.individualBuffs },
		debuffs: {
			misery: false,
			curseOfElements: "TristateEffectMissing",
			improvedSealOfTheCrusader: "TristateEffectMissing",
			judgementOfWisdom: false,
			judgementOfLight: false,
			bloodFrenzy: false,
			huntersMark: "TristateEffectMissing",
			curseOfRecklessness: false,
			sunderArmor: false,
			faerieFire: "TristateEffectMissing",
			exposeArmor: "TristateEffectMissing",
			insectSwarm: false,
			exposeWeaknessUptime: 0,
			exposeWeaknessHunterAgility: 0,
		},
		consumables: {
			flaskId: 0,
			battleElixirId: 0,
			guardianElixirId: 0,
			foodId: 0,
			potId: 0,
			conjuredId: 0,
			mhImbueId: 0,
			explosiveId: 0,
			superSapper: false,
			goblinSapper: false,
			nightmareSeed: false,
			scrollStr: false,
			scrollAgi: false,
			scrollArm: false,
		},
		simpleRotation: {
			prioritizeHolyShield: false,
			consecrationRank: 0,
			useExorcism: false,
			useHammerOfWrath: false,
			useAvengersShield: false,
			precastAvengersShield: false,
			maintainJudgement: "JudgementNone",
			aura: "AuraNone",
		},
	};
}

describe("raidProfileToModifierSources", () => {
	it("returns nothing for an all-off profile", () => {
		expect(raidProfileToModifierSources(makeRaidProfile({}))).toEqual([]);
	});

	it("translates a flat stat buff (Power Word: Fortitude)", () => {
		const sources = raidProfileToModifierSources(
			makeRaidProfile({
				raidBuffs: { powerWordFortitude: "TristateEffectRegular" },
			}),
		);
		expect(sources).toEqual([
			expect.objectContaining({
				id: "power-word-fortitude",
				stats: [{ name: "Stamina", value: 79, type: "flat" }],
			}),
		]);
	});

	it("applies the improved tristate's truncated value (Power Word: Fortitude)", () => {
		const sources = raidProfileToModifierSources(
			makeRaidProfile({
				raidBuffs: { powerWordFortitude: "TristateEffectImproved" },
			}),
		);
		// 79 * 1.3 = 102.7, truncated to 102 like the game (see buffs.go's PowerWordFortitudeAura).
		expect(sources[0].stats).toEqual([{ name: "Stamina", value: 102, type: "flat" }]);
	});

	it("translates a multiplier stat buff (Blessing of Kings)", () => {
		const sources = raidProfileToModifierSources(
			makeRaidProfile({ individualBuffs: { blessingOfKings: true } }),
		);
		expect(sources).toEqual([
			expect.objectContaining({
				id: "blessing-of-kings",
				stats: [
					{ name: "Stamina", value: 0.1, type: "multiplier" },
					{ name: "Agility", value: 0.1, type: "multiplier" },
					{ name: "Strength", value: 0.1, type: "multiplier" },
					{ name: "Spirit", value: 0.1, type: "multiplier" },
					{ name: "Intellect", value: 0.1, type: "multiplier" },
				],
			}),
		]);
	});

	it("translates a totem stat buff (Strength of Earth Totem)", () => {
		const sources = raidProfileToModifierSources(
			makeRaidProfile({
				partyBuffs: { strengthOfEarthTotem: "TristateEffectImproved" },
			}),
		);
		// floor(86 * 1.15) = 98 (see buffs.go's StrengthOfEarthTotemValue).
		expect(sources).toEqual([
			expect.objectContaining({
				id: "strength-of-earth-totem",
				stats: [{ name: "Strength", value: 98, type: "flat" }],
			}),
		]);
	});

	it("no-ops an excluded proc/effect buff (Blessing of Sanctuary)", () => {
		const sources = raidProfileToModifierSources(
			makeRaidProfile({ individualBuffs: { blessingOfSanctuary: true } }),
		);
		expect(sources).toEqual([]);
	});

	it("no-ops an excluded short-cooldown buff (Bloodlust)", () => {
		const sources = raidProfileToModifierSources(
			makeRaidProfile({ raidBuffs: { bloodlust: true } }),
		);
		expect(sources).toEqual([]);
	});

	it("resolves exclusivity by keeping only the higher-value shadow resistance source", () => {
		const withShadowProtectionOnly = raidProfileToModifierSources(
			makeRaidProfile({ raidBuffs: { shadowProtection: true } }),
		);
		expect(withShadowProtectionOnly).toEqual([
			expect.objectContaining({
				id: "shadow-protection",
				stats: [{ name: "ShadowResistance", value: 70, type: "flat" }],
			}),
		]);

		// Gift of the Wild (improved) alone would grant floor(25*1.35)=33 Shadow Resistance, but
		// Shadow Protection's 70 wins the exclusive slot when both are enabled - matching the real
		// sim's ExclusiveEffect priority behavior instead of stacking them to 103.
		const withBoth = raidProfileToModifierSources(
			makeRaidProfile({
				raidBuffs: {
					shadowProtection: true,
					giftOfTheWild: "TristateEffectImproved",
				},
			}),
		);
		const shadowResistanceSources = withBoth.filter((source) =>
			source.stats.some((stat) => stat.name === "ShadowResistance"),
		);
		expect(shadowResistanceSources).toEqual([
			expect.objectContaining({ id: "shadow-protection" }),
		]);
	});
});
