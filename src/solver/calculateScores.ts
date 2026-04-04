import type { Stat } from "./types";

// Agility -> 1 avoidance per 25
// Defense -> 1 avoidance per 15
// Dodge -> 1 avoidance per 18.9
// Parry -> 1 avoidance per 23.6
export const calculateAvoidance = (stat: Stat, uncrushabilitySetting: number) => {
	if (uncrushabilitySetting === 0) return 0;
	switch (stat.name) {
		// TODO: depends on class
		// Druid -> 1 per 14.7
		// Paladin -> 1 per 25
		// Warrior -> 1 per 30
		case "Agility":
			return stat.value / 25;
		case "Defense":
			return stat.value / 15;
		case "Dodge":
			return stat.value / 18.9;
		case "Parry":
			return stat.value / 23.6;
		case "Block":
			return stat.value / 7.9;
		default:
			return 0;
	}
};

export const calculateObjectiveScore = (stat: Stat, optimizeStats: Stat[]) => {
	const statCoefficient = optimizeStats.find((s) => s.name === stat.name)?.value || 0;
	return stat.value * statCoefficient;
};

export const calculateUncritability = (stat: Stat, uncritabilitySetting: number) => {
	if (uncritabilitySetting === 0) return 0;
	const DEFENSE_RATING_PER_SKILL = 2.4;
	const RESILIENCE_RATING_PER_SKILL = 39.4;
	switch (stat.name) {
		case "Resilience":
			return 0.04 * (stat.value / RESILIENCE_RATING_PER_SKILL);
		case "Defense":
			return 0.04 * (stat.value / DEFENSE_RATING_PER_SKILL);
		default:
			return 0;
	}
};
