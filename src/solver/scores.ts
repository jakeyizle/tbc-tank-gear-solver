import { calculateStatValue } from "#/helpers/stats"
import type { ModifierSource, Stat, StatName } from "./types";

const calculateAvoidanceScore = (
    stats: Stat[],
    modifierSources: ModifierSource[] = [],
    statName: "Avoidance" | "ShearAvoidance" = "Avoidance",
) => {
    const avoidance = calculateStatValue({items: [], modifierSources, statName, baseStats: stats, roundDefenseAndResilience: false});
    return avoidance;
}

const calculateUncritabilityScore = (stats: Stat[], modifierSources: ModifierSource[] = []) => {
    const uncritability = calculateStatValue({items: [], modifierSources, statName: "Uncritability", baseStats: stats, roundDefenseAndResilience: false});    
    return uncritability;
}

const calculateObjectiveScore = (stats: Stat[], objectiveStats: Stat[], modifierSources: ModifierSource[] = []) => {
    // for each objective stat
    // sum the stats for that stat
    // then multiply that value by the objective stat value
    let objectiveScore = 0;
    for (const objectiveStat of objectiveStats) {
        const statSum = calculateStatValue({items: [], modifierSources, statName: objectiveStat.name, baseStats: stats, roundDefenseAndResilience: false});
        objectiveScore += statSum * objectiveStat.value;
    }

    return objectiveScore;
}

const calculateResistanceScores = (
    stats: Stat[],
    resistanceStats: StatName[],
    modifierSources: ModifierSource[] = [],
): Partial<Record<StatName, number>> => {
    const result: Partial<Record<StatName, number>> = {};
    for (const statName of resistanceStats) {
        result[statName] = calculateStatValue({
            items: [],
            modifierSources,
            statName,
            baseStats: stats,
            roundDefenseAndResilience: false,
        });
    }
    return result;
}

export const calculateScores = (
    stats: Stat[],
    objectiveStats: Stat[],
    modifierSources: ModifierSource[] = [],
    avoidanceStatName: "Avoidance" | "ShearAvoidance" = "Avoidance",
    resistanceStats: StatName[] = [],
) => {
    const avoidanceScore = calculateAvoidanceScore(stats, modifierSources, avoidanceStatName);
    const uncritabilityScore = calculateUncritabilityScore(stats, modifierSources);
    const objectiveScore = calculateObjectiveScore(stats, objectiveStats, modifierSources);
    const resistanceScores = calculateResistanceScores(stats, resistanceStats, modifierSources);
    return { avoidanceScore, uncritabilityScore, objectiveScore, resistanceScores };
}