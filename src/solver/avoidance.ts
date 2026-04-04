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

const convertDefenseRatingToSkill = (defenseRating: number) => {
	return defenseRating / 2.4;
};

const BASE_AVOIDANCE_TARGET = 102.4;
const BASE_DEFENSE_SKILL = 350;
export const calculateAvoidanceTarget = (
	raceId: string,
	classId: string,
	uncrushabilitySetting: number,
) => {
	if (uncrushabilitySetting === 0) return 0;
	const baseDefenseRating = convertDefenseRatingToSkill(BASE_DEFENSE_SKILL);
	const baseDefenseAvoidance = calculateAvoidance({
		name: "Defense",
		value: baseDefenseRating,
	}, uncrushabilitySetting);

	const baseAgility = getAgilityByRaceAndClass(raceId, classId);
	const baseAgilityAvoidance = calculateAvoidance({
		name: "Agility",
		value: baseAgility,
	}, uncrushabilitySetting);

	// TODO: include buffs (mark of the wild, kings)
	// talents (paladin parry, paladin defense)
	// radcials (night elf dodge)
	// consumables (agility elixir, scrolls)
	// take into account class stuff (holy shield)
	const HOLY_SHIELD_AVOIDANCE = 30;

	const ANTICIPATION_DEFENSE_SKILL = 20;
	const ANTICIPATION_DEFENSE_AVOIDANCE = calculateAvoidance({
		name: "Defense",
		value: ANTICIPATION_DEFENSE_SKILL,
	}, uncrushabilitySetting);

	const PARRY_TALENT_AVOIDANCE = 5;

	return (
		BASE_AVOIDANCE_TARGET -
		baseAgilityAvoidance -
		baseDefenseAvoidance -
		HOLY_SHIELD_AVOIDANCE -
		ANTICIPATION_DEFENSE_AVOIDANCE -
		PARRY_TALENT_AVOIDANCE
	);
};

// TODO: make configurable (should be either 4.6 or 4.4, but incorporate talents etc)
export const calculateUncritabilityTarget = (uncritabilitySetting: number) => {
	const CRIT_TARGET =
		uncritabilitySetting === 0 ? 0 : uncritabilitySetting === 1 ? 4.4 : 4.6;
	return CRIT_TARGET;
};
