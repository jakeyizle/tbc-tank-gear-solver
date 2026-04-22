import type { StatName } from "#/solver/types";
import type {StatModifier}  from "../data/types";

export function createStatModifier(statName: StatName, value: number, type: 'flat' | 'multiplier' = 'flat'
    
): StatModifier {
    return {
        statName,
        value,
        type
    }
}