import { describe, expect, it } from "vitest";
import {
	DEFAULT_SIM_CALIBRATION_PROFILE,
	type SimCalibrationProfile,
} from "#/types/SimCalibrationProfile";
import { toGearRefs } from "./buildSimPlayer";
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
				DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.talentsString,
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

// buildSimPlayer's own assertions, added here rather than in a separate file because
// buildStatWeightsRequest is already a thin wrapper over buildPlayer/buildEncounter (lines 57 and
// 61) and this test file already drives it with a real profile.
//
// Every one of these guards a trap the proto3 JSON mapping sets, and all four fail SILENTLY: a
// misplaced field is dropped rather than rejected, so the sim happily returns numbers for a
// character that is not the one the user configured.
describe("buildSimPlayer's proto shape", () => {
	// A proto3 JSON oneof is flattened onto its parent message, never nested under its group
	// name. Nesting it under "spec" is the bug the Phase 0 execution log records: the sim then
	// sees no spec options at all and sims a specless paladin.
	it("puts protectionPaladin at the top level, with no 'spec' wrapper", () => {
		const request = buildRequest(DEFAULT_SIM_CALIBRATION_PROFILE);
		expect(request.player.protectionPaladin).toBeDefined();
		expect(
			(request.player as unknown as Record<string, unknown>).spec,
		).toBeUndefined();
	});

	// rotation is top-level too, and it must be the PRECOMPILED APL - the Go sim never reads the
	// simple-rotation booleans directly.
	it("puts the precompiled rotation at the top level", () => {
		const request = buildRequest(DEFAULT_SIM_CALIBRATION_PROFILE);
		expect(request.player.rotation).toEqual(
			buildProtPaladinRotation(
				DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.simpleRotation,
				DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile.talentsString,
			),
		);
	});

	// The character's own race must win over PROT_PALADIN_PLAYER_DEFAULTS.race, which is a
	// baseline constant rather than a choice. This is a spread-ORDER dependency: move `race:`
	// above the spread and every character silently sims as the default race again, which is
	// exactly the bug Phase 4 fixed (a Human simmed as a Draenei).
	it("lets the profile's race override the baseline default", () => {
		const request = buildRequest({
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			raidProfile: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile,
				race: "RaceDwarf",
			},
		});
		expect(request.player.race).toBe("RaceDwarf");
	});

	it("equips exactly the gear it was handed", () => {
		const request = buildRequest(DEFAULT_SIM_CALIBRATION_PROFILE);
		expect(request.player.equipment.items).toHaveLength(fakeGear.length);
		expect(request.player.equipment.items[0].id).toBe(1);
	});
});

describe("toGearRefs", () => {
	// Empty gem sockets come through as id 0. Passing those to the database filter would ask it
	// for a gem that does not exist; dropping them is what keeps the SimDatabase minimal.
	it("drops empty gem sockets", () => {
		expect(
			toGearRefs([
				{ id: "1", enchant: { id: "" }, gemSlots: ["0", "12345", "0"] },
			]),
		).toEqual([{ id: 1, enchant: undefined, gems: [12345] }]);
	});

	// enchant is always a defined object (EMPTY_ENCHANT when unenchanted, id: ""), so the check
	// has to be on the id rather than on the object.
	it("omits the enchant when the item is unenchanted", () => {
		expect(
			toGearRefs([{ id: "1", enchant: { id: "" }, gemSlots: [] }])[0].enchant,
		).toBeUndefined();
	});

	it("converts ids from strings to the numbers the proto expects", () => {
		const [ref] = toGearRefs([
			{ id: "28677", enchant: { id: "2649" }, gemSlots: ["24032"] },
		]);
		expect(ref).toEqual({ id: 28677, enchant: 2649, gems: [24032] });
	});
});
