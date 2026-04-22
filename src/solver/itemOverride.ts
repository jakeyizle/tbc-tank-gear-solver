import type { Item, Stat, StatName } from "./types";

const createStat = (name: StatName, value: number, type: 'flat' | 'multiplier' = 'flat'): Stat => ({ name, value, type });

export const overrideItem = (item: Item) => {
    switch (item.name) {
        case "Libram of Repentance":
            return { ...item, stats: [createStat("Block", 42)] };
        case "Libram of the Eternal Rest":
            return {...item, stats: [createStat("SpellPower", 12)] };
        default:
            return item;
    }
}