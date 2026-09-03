// Everything a "Weighted Sim Metrics" calibration run feeds into the real tbc-new combat sim,
// as user-editable settings instead of the v1 hardcoded constants in src/sim/protPaladinEncounter.ts
// and src/sim/protPaladinProfile.ts. DEFAULT_SIM_CALIBRATION_PROFILE below is built directly
// from those existing constants, so an unedited profile reproduces today's calibration request
// exactly - see docs/plans referenced in this session for the "read from user input instead of
// a constant, not a redesign" rationale.
//
// String enum fields use tbc-new's own proto3 JSON string values (see vendor/tbc-sim/proto/
// common.proto and paladin.proto) rather than this repo's generated proto types, matching
// protPaladinProfile.ts's existing "plain JSON objects" style.
import {
	PROT_PALADIN_REFERENCE_ENCOUNTER,
	PROT_PALADIN_REFERENCE_ENCOUNTER_NAME,
	TARGET_ARMOR_STAT_INDEX,
	TARGET_HEALTH_STAT_INDEX,
} from "#/sim/protPaladinEncounter";
import {
	PROT_PALADIN_CONSUMABLES,
	PROT_PALADIN_DEBUFFS,
	PROT_PALADIN_DEFAULT_SIMPLE_ROTATION,
	PROT_PALADIN_INDIVIDUAL_BUFFS,
	PROT_PALADIN_PARTY_BUFFS,
	PROT_PALADIN_PLAYER_DEFAULTS,
	PROT_PALADIN_RAID_BUFFS,
	PROT_PALADIN_TALENTS_STRING,
} from "#/sim/protPaladinProfile";

export type TristateEffect =
	| "TristateEffectMissing"
	| "TristateEffectRegular"
	| "TristateEffectImproved";

export type DrumsType =
	| "DrumsUnknown"
	| "GreaterDrumsOfBattle"
	| "GreaterDrumsOfRestoration"
	| "GreaterDrumsOfWar"
	| "LesserDrumsOfBattle"
	| "LesserDrumsOfRestoration"
	| "LesserDrumsOfWar";

// "SanctityAura" is deliberately excluded - tbc-new falls back from it to AuraNone when the
// Sanctity Aura talent is missing, and this app doesn't derive talent presence from the (now
// user-editable) talent string - see protPaladinSimpleRotation.ts's header comment.
export type PaladinAura =
	| "AuraNone"
	| "DevotionAura"
	| "RetributionAura"
	| "ConcentrationAura"
	| "FireResistanceAura"
	| "FrostResistanceAura"
	| "ShadowResistanceAura";

export type PaladinJudgement =
	| "JudgementNone"
	| "JudgementOfLight"
	| "JudgementOfWisdom";

export interface CalibrationSettings {
	/** Sim iterations per stat perturbation branch - higher = less noisy, slower. */
	iterations: number;
	/** Cap on calibrate -> solve -> reconverge rounds (see solveSimMetric.ts). */
	maxRounds: number;
	/**
	 * How many parallel Worker threads run calibration sims (see simWorkerPool.ts). 0 = auto
	 * (min(4, hardwareConcurrency / 2), the default this app has always used).
	 */
	workerCount: number;
}

export interface EncounterSettings {
	duration: number;
	durationVariation: number;
	bossArmor: number;
	bossHealth: number;
	minBaseDamage: number;
	damageSpread: number;
	swingSpeed: number;
}

export interface HealingModelSettings {
	hps: number;
	cadenceSeconds: number;
	cadenceVariation: number;
	absorbFrac: number;
	/** Seconds width of the TMI sliding window - wowsims' own "TMI Burst Window" setting. */
	burstWindow: number;
	inspirationUptime: number;
}

export interface RaidBuffSettings {
	bloodlust: boolean;
	divineSpirit: TristateEffect;
	arcaneBrilliance: boolean;
	giftOfTheWild: TristateEffect;
	powerWordFortitude: TristateEffect;
	shadowProtection: boolean;
	thorns: TristateEffect;
}

export interface PartyBuffSettings {
	manaSpringTotem: TristateEffect;
	wrathOfAirTotem: TristateEffect;
	graceOfAirTotem: TristateEffect;
	strengthOfEarthTotem: TristateEffect;
	windfuryTotem: TristateEffect;
	battleShout: TristateEffect;
	drums: DrumsType;
	sanctityAura: TristateEffect;
}

export interface IndividualBuffSettings {
	blessingOfKings: boolean;
	blessingOfWisdom: TristateEffect;
	blessingOfMight: TristateEffect;
	blessingOfSanctuary: boolean;
}

export interface DebuffSettings {
	misery: boolean;
	curseOfElements: TristateEffect;
	improvedSealOfTheCrusader: TristateEffect;
	judgementOfWisdom: boolean;
	judgementOfLight: boolean;
	bloodFrenzy: boolean;
	huntersMark: TristateEffect;
	curseOfRecklessness: boolean;
	sunderArmor: boolean;
	faerieFire: TristateEffect;
	exposeArmor: TristateEffect;
	insectSwarm: boolean;
	exposeWeaknessUptime: number;
	exposeWeaknessHunterAgility: number;
}

export interface ConsumableSettings {
	flaskId: number;
	foodId: number;
	potId: number;
	conjuredId: number;
	mhImbueId: number;
	explosiveId: number;
	superSapper: boolean;
	goblinSapper: boolean;
	nightmareSeed: boolean;
	scrollStr: boolean;
	scrollAgi: boolean;
	scrollArm: boolean;
}

// useAvengersShield/precastAvengersShield are deliberately omitted - tbc-new forces both to
// false unless the character's talent string has the Avenger's Shield talent, which this app's
// fixed reference build doesn't have either; see protPaladinSimpleRotation.ts's header comment
// for why this isn't re-derived from the (now user-editable) talent string.
export interface SimpleRotationSettings {
	prioritizeHolyShield: boolean;
	consecrationRank: number;
	useExorcism: boolean;
	useHammerOfWrath: boolean;
	maintainJudgement: PaladinJudgement;
	aura: PaladinAura;
}

export interface RaidProfileSettings {
	talentsString: string;
	raidBuffs: RaidBuffSettings;
	partyBuffs: PartyBuffSettings;
	individualBuffs: IndividualBuffSettings;
	debuffs: DebuffSettings;
	consumables: ConsumableSettings;
	simpleRotation: SimpleRotationSettings;
}

export interface SimCalibrationProfile {
	calibration: CalibrationSettings;
	encounter: EncounterSettings;
	healingModel: HealingModelSettings;
	raidProfile: RaidProfileSettings;
}

// Absolute (not marginal) sim results for one gear set - see calibrateWeights.ts's
// measureFinalSimMetrics. Lives here (a neutral shared-types module both src/solver/ and
// src/sim/ already import) rather than in src/sim/calibrateWeights.ts itself, so src/solver/
// can reference the shape without statically importing src/sim/ - see solver.worker.ts's note
// on why that boundary is dynamic-import-only.
export interface SimMetricsSnapshot {
	tps: number;
	dtps: number;
	tmi5: number;
}

const referenceTarget = PROT_PALADIN_REFERENCE_ENCOUNTER.targets[0];

export const DEFAULT_SIM_CALIBRATION_PROFILE: SimCalibrationProfile = {
	calibration: {
		iterations: 4000,
		maxRounds: 5,
		workerCount: 0,
	},
	encounter: {
		duration: PROT_PALADIN_REFERENCE_ENCOUNTER.duration,
		durationVariation: PROT_PALADIN_REFERENCE_ENCOUNTER.durationVariation,
		bossArmor: referenceTarget.stats[TARGET_ARMOR_STAT_INDEX],
		bossHealth: referenceTarget.stats[TARGET_HEALTH_STAT_INDEX],
		minBaseDamage: referenceTarget.minBaseDamage,
		damageSpread: referenceTarget.damageSpread,
		swingSpeed: referenceTarget.swingSpeed,
	},
	healingModel: {
		hps: PROT_PALADIN_PLAYER_DEFAULTS.healingModel.hps,
		cadenceSeconds: PROT_PALADIN_PLAYER_DEFAULTS.healingModel.cadenceSeconds,
		cadenceVariation:
			PROT_PALADIN_PLAYER_DEFAULTS.healingModel.cadenceVariation,
		absorbFrac: PROT_PALADIN_PLAYER_DEFAULTS.healingModel.absorbFrac,
		burstWindow: PROT_PALADIN_PLAYER_DEFAULTS.healingModel.burstWindow,
		inspirationUptime:
			PROT_PALADIN_PLAYER_DEFAULTS.healingModel.inspirationUptime,
	},
	raidProfile: {
		talentsString: PROT_PALADIN_TALENTS_STRING,
		raidBuffs: { ...PROT_PALADIN_RAID_BUFFS } as RaidBuffSettings,
		partyBuffs: { ...PROT_PALADIN_PARTY_BUFFS } as PartyBuffSettings,
		individualBuffs: {
			...PROT_PALADIN_INDIVIDUAL_BUFFS,
		} as IndividualBuffSettings,
		debuffs: { ...PROT_PALADIN_DEBUFFS } as DebuffSettings,
		consumables: { ...PROT_PALADIN_CONSUMABLES },
		simpleRotation: {
			prioritizeHolyShield:
				PROT_PALADIN_DEFAULT_SIMPLE_ROTATION.prioritizeHolyShield,
			consecrationRank: PROT_PALADIN_DEFAULT_SIMPLE_ROTATION.consecrationRank,
			useExorcism: PROT_PALADIN_DEFAULT_SIMPLE_ROTATION.useExorcism,
			useHammerOfWrath: PROT_PALADIN_DEFAULT_SIMPLE_ROTATION.useHammerOfWrath,
			maintainJudgement: PROT_PALADIN_DEFAULT_SIMPLE_ROTATION.maintainJudgement,
			aura: PROT_PALADIN_DEFAULT_SIMPLE_ROTATION.aura,
		} as SimpleRotationSettings,
	},
};

export { PROT_PALADIN_REFERENCE_ENCOUNTER_NAME };
