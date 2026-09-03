import { describe, expect, it } from "vitest";
import {
	DEFAULT_SIM_CALIBRATION_PROFILE,
	type SimCalibrationProfile,
} from "#/types/SimCalibrationProfile";
import {
	buildStatWeightsRequest,
	type TbcUiDatabase,
} from "./buildStatWeightsRequest";
import {
	PROT_PALADIN_REFERENCE_ENCOUNTER,
	TARGET_ARMOR_STAT_INDEX,
	TARGET_HEALTH_STAT_INDEX,
} from "./protPaladinEncounter";
import { buildProtPaladinRotation } from "./protPaladinSimpleRotation";
import type { GearPiece } from "./toTbcItemSpec";

const fakeDb: TbcUiDatabase = { items: [], enchants: [], gems: [] };

const fakeGear: GearPiece[] = [{ id: "1", enchant: { id: "" }, gemSlots: [] }];

function buildRequest(profile: SimCalibrationProfile) {
	return buildStatWeightsRequest(
		fakeGear,
		fakeDb,
		["Stamina", "Armor"],
		500,
		profile,
	);
}

describe("buildStatWeightsRequest", () => {
	it("reproduces today's fixed v1 request exactly when given the default profile", () => {
		const request = buildRequest(DEFAULT_SIM_CALIBRATION_PROFILE);

		expect(request.encounter).toEqual(PROT_PALADIN_REFERENCE_ENCOUNTER);
		expect(request.player.healingModel).toEqual(
			DEFAULT_SIM_CALIBRATION_PROFILE.healingModel,
		);
		expect(request.player.talentsString).toBe(
			DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.talentsString,
		);
		expect(request.player.rotation).toEqual(
			buildProtPaladinRotation(
				DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.simpleRotation,
			),
		);
	});

	it("passes iterations and statsToWeigh through independent of the profile", () => {
		const request = buildRequest(DEFAULT_SIM_CALIBRATION_PROFILE);
		expect(request.simOptions.iterations).toBe(500);
		expect(request.statsToWeigh).toEqual(["StatStamina", "StatArmor"]);
	});

	it("writes a custom boss armor/health into the encounter target's stats array", () => {
		const profile: SimCalibrationProfile = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			encounter: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.encounter,
				bossArmor: 11111,
				bossHealth: 22222,
			},
		};
		const request = buildRequest(profile);
		const stats = request.encounter.targets[0].stats;
		expect(stats[TARGET_ARMOR_STAT_INDEX]).toBe(11111);
		expect(stats[TARGET_HEALTH_STAT_INDEX]).toBe(22222);
	});

	it("writes custom encounter duration/damage fields onto the request's encounter", () => {
		const profile: SimCalibrationProfile = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			encounter: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.encounter,
				duration: 300,
				durationVariation: 20,
				minBaseDamage: 5000,
				damageSpread: 0.25,
				swingSpeed: 1.5,
			},
		};
		const request = buildRequest(profile);
		expect(request.encounter.duration).toBe(300);
		expect(request.encounter.durationVariation).toBe(20);
		expect(request.encounter.targets[0].minBaseDamage).toBe(5000);
		expect(request.encounter.targets[0].damageSpread).toBe(0.25);
		expect(request.encounter.targets[0].swingSpeed).toBe(1.5);
	});

	it("writes a custom healing model onto the request's player", () => {
		const profile: SimCalibrationProfile = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			healingModel: {
				hps: 9999,
				cadenceSeconds: 1.2,
				cadenceVariation: 0.5,
				absorbFrac: 0.1,
				burstWindow: 10,
				inspirationUptime: 0.4,
			},
		};
		const request = buildRequest(profile);
		expect(request.player.healingModel).toEqual(profile.healingModel);
	});

	it("writes custom talents/buffs/debuffs/consumables from raidProfile onto the request", () => {
		const raidProfile: SimCalibrationProfile["raidProfile"] = {
			...DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile,
			talentsString: "custom-talent-string",
			raidBuffs: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.raidBuffs,
				bloodlust: true,
			},
			partyBuffs: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.partyBuffs,
				battleShout: "TristateEffectImproved",
			},
			individualBuffs: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.individualBuffs,
				blessingOfKings: false,
			},
			debuffs: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.debuffs,
				misery: true,
			},
			consumables: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.consumables,
				flaskId: 12345,
			},
		};
		const profile: SimCalibrationProfile = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			raidProfile,
		};
		const request = buildRequest(profile);

		expect(request.player.talentsString).toBe("custom-talent-string");
		expect(request.player.buffs.blessingOfKings).toBe(false);
		expect(request.player.consumables.flaskId).toBe(12345);
		expect(request.raidBuffs.bloodlust).toBe(true);
		expect(request.partyBuffs.battleShout).toBe("TristateEffectImproved");
		expect(request.debuffs.misery).toBe(true);
	});
});
