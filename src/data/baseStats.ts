import { convertStatToRating } from "#/helpers.ts/convertStat";
import type { Stat, StatName } from "#/solver/types";
import LevelStats from "./level_stats.json";

// TODO: base dodge varies by race/class
const BASE_DODGE_AVOIDANCE_CHANCE = 0.65;
const BASE_PARRY_AVOIDANCE_CHANCE = 5;
const BASE_MISS_AVOIDANCE_CHANCE = 5;
const BASE_BLOCK_AVOIDANCE_CHANCE = 5;

const createStat = (name: StatName, value: number, type: 'flat' | 'multiplier' = 'flat'): Stat => ({ name, value, type });

export const getBaseStats = (raceId: string, classId: string): Stat[] => {
	const entry = LevelStats.find(
		(entry) => entry.race === raceId && entry.class === classId,
	);
	if (!entry) {
		throw new Error(`No entry found for race ${raceId} and class ${classId}`);
	}

    const baseStats = entry.stats.map((stat) => createStat(stat.name as StatName, stat.value));

    // TODO make this not fucked up
    const additionalBaseStats = [
        createStat("Dodge",convertStatToRating({ name: "Dodge", value:BASE_DODGE_AVOIDANCE_CHANCE, type: 'flat' })),
        createStat("Parry",convertStatToRating({ name: "Parry", value:BASE_PARRY_AVOIDANCE_CHANCE, type: 'flat' })), 
        createStat("Miss", convertStatToRating({ name: "Miss", value:BASE_MISS_AVOIDANCE_CHANCE, type: 'flat' })), 
        createStat("Block", convertStatToRating({ name: "Block", value:BASE_BLOCK_AVOIDANCE_CHANCE, type: 'flat' })),
    ]

    return [...baseStats, ...additionalBaseStats];
};
