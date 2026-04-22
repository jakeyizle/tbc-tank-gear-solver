import type { ModifierSource } from "#/solver/types";

export const TALENTS: ModifierSource[] = [
    {
        name: "Toughness",
        id: "toughness",
        type: "talent",
        maxRank: 5,
        stats: [
            {
                name: "Armor",
                value: .02,
                type: "multiplier"
            }
        ]
    },
    {
        name: "Anticipation",
        id: "anticipation",
        type: "talent",
        maxRank: 5,
        stats: [
            {
                name: "Defense",
                value: 4,
                type: "flat"
            }
        ]
    },
    {
        name: "Sacred Duty",
        id: "sacred-duty",
        type: "talent",
        maxRank: 2,
        stats: [
            {
                name: "Stamina",
                value: .03,
                type: "multiplier"
            }
        ]
    },
    {
        name: "Combat Expertise",
        id: "combat-expertise",
        type: "talent",
        maxRank: 5,
        stats: [
            {
                name: "Stamina",
                value: .02,
                type: "multiplier"
            }
        ]
    },
    {
        name: "Deflection",
        id: "deflection",
        type: "talent",
        maxRank: 5,
        stats: [
            {
                name: "Parry",
                // 1% per rank
                value: 23.6538,
                type: "flat"
            }
        ]
    }
]