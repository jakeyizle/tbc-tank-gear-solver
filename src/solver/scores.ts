import { calculateStatValue } from "#/helpers.ts/stats"
import type { ModifierSource, Stat } from "./types";

export const calculateAvoidanceScore = (stats: Stat[], modifierSources: ModifierSource[] = []) => {
    const avoidance = calculateStatValue({items: [], modifierSources, statName: "Avoidance", baseStats: stats, roundDefenseAndResilience: false});    
    return avoidance;
}

export const calculateUncritabilityScore = (stats: Stat[], modifierSources: ModifierSource[] = []) => {
    const uncritability = calculateStatValue({items: [], modifierSources, statName: "Uncritability", baseStats: stats, roundDefenseAndResilience: false});    
    return uncritability;
}

export const calculateObjectiveScore = (stats: Stat[], objectiveStats: Stat[], modifierSources: ModifierSource[] = []) => {
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

export const calculateScores = (stats: Stat[], objectiveStats: Stat[], modifierSources: ModifierSource[] = []) => {
    const avoidanceScore = calculateAvoidanceScore(stats, modifierSources);
    const uncritabilityScore = calculateUncritabilityScore(stats, modifierSources);
    const objectiveScore = calculateObjectiveScore(stats, objectiveStats, modifierSources);
    return { avoidanceScore, uncritabilityScore, objectiveScore };
}