import LevelStats from "./level_stats.json";

// TODO: base dodge varies by race/class
const BASE_DODGE_AVOIDANCE_CHANCE = 0.65;
const BASE_PARRY_AVOIDANCE_CHANCE = 5;
const BASE_MISS_AVOIDANCE_CHANCE = 5;
const BASE_BLOCK_AVOIDANCE_CHANCE = 5;

export const getBaseStats = (raceId: string, classId: string) => {
	const entry = LevelStats.find(
		(entry) => entry.race === raceId && entry.class === classId,
	);
	if (!entry) {
		throw new Error(`No entry found for race ${raceId} and class ${classId}`);
	}

    const additionalBaseStats = {
        
    }

	return entry;
};
