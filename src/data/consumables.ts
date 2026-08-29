import type { ConsumableItem } from "../solver/types";

// wowheadId is a placeholder (0) for each entry -- filled in by a separate data pass.
export const CONSUMABLES: ConsumableItem[] = [
    {
        id: "flask-of-blinding-light",
        name: "Flask of Blinding Light",
        type: "Flask",
        wowheadId: 0,
        stats: [
            {
                name: "SpellPower",
                value: 80,
                type: "flat"
            }
        ]
    },
    {
        id: "flask-of-fortification",
        name: "Flask of Fortification",
        type: "Flask",
        wowheadId: 0,
        stats: [
            {
                name: "Health",
                value: 500,
                type: "flat"
            },
            {
                name: "Defense",
                value: 10,
                type: "flat"
            }
        ]
    },
    {
        id: "elixir-of-major-defense",
        name: "Elixir of Major Defense",
        type: "GuardianElixir",
        wowheadId: 0,
        stats: [
            {
                name: "Armor",
                value: 550,
                type: "flat"
            }
        ]
    },
    {
        id: "elixir-of-major-fortitude",
        name: "Elixir of Major Fortitude",
        type: "GuardianElixir",
        wowheadId: 0,
        stats: [
            {
                name: "Armor",
                value: 250,
                type: "flat"
            }
        ]
    },
    {
        id: "greater-arcane-elixir",
        name: "Greater Arcane Elixir",
        type: "BattleElixir",
        wowheadId: 0,
        stats: [
            {
                name: "SpellPower",
                value: 35,
                type: "flat"
            }
        ]
    },
    {
        id: "elixir-of-major-agility",
        name: "Elixir of Major Agility",
        type: "BattleElixir",
        wowheadId: 0,
        stats: [
            {
                name: "Agility",
                value: 35,
                type: "flat"
            }
        ]
    }
];
