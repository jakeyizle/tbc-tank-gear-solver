import type { ModifierSource } from "../solver/types";

export const getAbilities = (classId: string) => {
    return ABILITIES.filter((ability) => ability.classId === classId);
}

const ABILITIES: ModifierSource[] = [
    {
        classId: "2",
        name: "Holy Shield",
        id: "holy-shield",
        type: "ability",
        stats: [
            {
                name: "Block",
                value: 30,
                type: "flat"
            }
        ]
    }
]