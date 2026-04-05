import LevelStats from "../data/level_stats.json";
import { calculateAvoidance } from "./calculateScores";

const getAgilityByRaceAndClass = (raceId: string, classId: string) => {
	const entry = LevelStats.find(
		(entry) => entry.race === raceId && entry.class === classId,
	);
	if (!entry) {
		throw new Error(`No agility found for race ${raceId} and class ${classId}`);
	}
	return entry.agi;
};

export const calculateBaseAvoidance = (
	raceId: string,
	classId: string,
	uncrushabilitySetting: number,
) => {
	const baseAgility = getAgilityByRaceAndClass(raceId, classId);
	const baseAgilityAvoidance = calculateAvoidance(
		{
			name: "Agility",
			value: baseAgility,
		},
		uncrushabilitySetting,
	);

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
	raceId: string,
	classId: string,
	uncrushabilitySetting: number,
) => {
	if (uncrushabilitySetting === 0) return 0;

	const baseAvoidance = calculateBaseAvoidance(
		raceId,
		classId,
		uncrushabilitySetting,
	);
	return BASE_AVOIDANCE_TARGET - baseAvoidance;
};

// TODO: make configurable (should be either 5.6 or 5.4, but incorporate talents etc)
export const calculateUncritabilityTarget = (uncritabilitySetting: number) => {
	const CRIT_TARGET =
		uncritabilitySetting === 0 ? 0 : uncritabilitySetting === 1 ? 5.4 : 5.6;
	return CRIT_TARGET;
};
