import type { ModifierSource } from "../solver/types";

export const BUFFS: ModifierSource[] = [
    {
        name: "Mark of the Wild",
        id: "mark-of-the-wild",
        type: "buff",
        stats: [
            {
                name: "Agility",
                value: 14,
                type: "flat"
            },
            {
                name: "Stamina",
                value: 14,
                type: "flat"
            },
            {
                name: "Strength",
                value: 14,
                type: "flat"
            },
            {
                name: "Spirit",
                value: 14,
                type: "flat"
            },
            {
                name: "Intellect",
                value: 14,
                type: "flat"
            }
        ]
    },
        {
        name: "Improved Mark of the Wild",
        id: "improved-mark-of-the-wild",
        type: "buff",
        stats: [
            {
                name: "Agility",
                value: 18.9,
                type: "flat"
            },
            {
                name: "Stamina",
                value: 18.9,
                type: "flat"
            },
            {
                name: "Strength",
                value: 18.9,
                type: "flat"
            },
            {
                name: "Spirit",
                value: 18.9,
                type: "flat"
            },
            {
                name: "Intellect",
                value: 18.9,
                type: "flat"
            }
        ]
    },
    {
        name: "Blessing of Kings",
        id: "blessing-of-kings",
        type: "buff",
        stats: [
            {
                name: "Stamina",
                value: .1,
                type: "multiplier"
            },
            {
                name: "Agility",
                value: .1,
                type: "multiplier"
            },
            {
                name: "Strength",
                value: .1,
                type: "multiplier"
            },
            {
                name: "Spirit",
                value: .1,
                type: "multiplier"
            },
            {
                name: "Intellect",
                value: .1,
                type: "multiplier"
            }
        ]
    }
];