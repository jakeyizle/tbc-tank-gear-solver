import { getBaseStat } from "#/helpers.ts/getBaseStat";

export const calculateBaseAvoidance = (
	raceId: string,
	classId: string,
) => {
	const baseAgility = getBaseStat("Agility", classId, raceId);
	const baseAgilityAvoidance = baseAgility / 25;

	// TODO: include buffs (mark of the wild, kings)
	// talents (paladin parry, paladin defense)
	// radcials (night elf dodge)
	// consumables (agility elixir, scrolls)
	// take into account class stuff (holy shield)
	const ANTICIPATION_DEFENSE_AVOIDANCE = 20 * 0.04 * 4;
	// TODO: base dodge varies by class
	const BASE_DODGE_AVOIDANCE = 0.65;
	const BASE_PARRY_AVOIDANCE = 5;
	const BASE_MISS_AVOIDANCE = 5;
	const BASE_BLOCK_AVOIDANCE = 5;

	const HOLY_SHIELD_AVOIDANCE = 30;
	const PARRY_TALENT_AVOIDANCE = 5;

	return (
		baseAgilityAvoidance +
		HOLY_SHIELD_AVOIDANCE +
		ANTICIPATION_DEFENSE_AVOIDANCE +
		PARRY_TALENT_AVOIDANCE +
		BASE_DODGE_AVOIDANCE +
		BASE_PARRY_AVOIDANCE +
		BASE_MISS_AVOIDANCE +
		BASE_BLOCK_AVOIDANCE
	);
};
const BASE_AVOIDANCE_TARGET = 102.4;
export const calculateAvoidanceTarget = (	
	uncrushabilitySetting: number,
	baseAvoidance: number
) => {
	if (uncrushabilitySetting === 0) return 0;	
	return BASE_AVOIDANCE_TARGET - baseAvoidance;
};

export const calculateBaseUncritability = (classId: string) => {
	// TODO: make configurable by class/talent
	// 20 defense from AVOIDANCE
	return 0.8;
}

// TODO: make configurable (should be either 5.6 or 5.4, but incorporate talents etc)
export const calculateUncritabilityTarget = (uncritabilitySetting: number, baseUncritability: number) => {
	if (uncritabilitySetting === 0) return 0;
	let CRIT_TARGET =
		uncritabilitySetting === 1 ? 5.4 : 5.6;
	CRIT_TARGET -= baseUncritability;
	return CRIT_TARGET;
};
