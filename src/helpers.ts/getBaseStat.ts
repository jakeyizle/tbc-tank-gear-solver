import type { StatName } from "#/solver/types";
import LevelStats from "../data/level_stats.json";

const getEntry = (raceId: string, classId: string) => {
	const entry = LevelStats.find(
		(entry) => entry.race === raceId && entry.class === classId,
	);
	if (!entry) {
		throw new Error(`No entry found for race ${raceId} and class ${classId}`);
	}
	return entry;
};

export const getBaseStat = (
	statName: StatName,
	classId: string,
	raceId: string,
) => {
	const entry = getEntry(raceId, classId);

	return entry.stats.find((stat) => stat.name === statName)?.value || 0;
};