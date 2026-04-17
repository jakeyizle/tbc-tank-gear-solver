import type { LPItem, StatName } from "#/solver/types";
import { getBaseStat } from "./getBaseStat";
import { getStatFromAllItems } from "./getStatFromItem";

function calculateHealthFromStamina(stamina: number) {
	// derived empirically - first 20 stam provides 1 hp each and stam is rounded down
	const staminaRounded = Math.floor(stamina);
	return (staminaRounded - 20) * 10 + 20;
}

function calculateHealth(items: LPItem[], raceId: string, classId: string) {
    // TODO: base health numbers are wrong - they are too high	
    const health = getEntireStat(items, "Health", raceId, classId);

    const stamina = getEntireStat(items, "Stamina", raceId, classId);
	// TODO: talents that increase stamina - sacred duty is 6% and combat expertise is 10%
    // these are multiplied, cannot be added together
    const SACRED_DUTY_STAM_MULTIPLIER = 1.06;
    const COMBAT_EXPERTISE_STAM_MULTIPLIER = 1.1;
	// TODO: include kings and other buffs
	const totalStamina = stamina * SACRED_DUTY_STAM_MULTIPLIER * COMBAT_EXPERTISE_STAM_MULTIPLIER;
	const healthFromStamina = calculateHealthFromStamina(totalStamina);
	return health + healthFromStamina;
}

function calculateMana(items: LPItem[], raceId: string, classId: string) {	
    const mana = getEntireStat(items, "Mana", raceId, classId);
	// TODO: include kings and other buffs
    const intellect = getEntireStat(items, "Intellect", raceId, classId);	
	const manaFromIntellect = (intellect) * 15;
	return mana + manaFromIntellect;
}

function calculateArmor(items: LPItem[], raceId: string, classId: string) {    
    const armor = getEntireStat(items, "Armor", raceId, classId);
    // TODO: talents increase armor
    const TOUGHNESS_ARMOR_MULTIPLIER = 1.06;
    const totalItemArmor = armor * TOUGHNESS_ARMOR_MULTIPLIER;

    const agility = getEntireStat(items, "Agility", raceId, classId);
    const armorFromAgility = agility * 2;
    return Math.floor(totalItemArmor + armorFromAgility);
}

function getEntireStat(items: LPItem[], stat: StatName, raceId: string, classId: string) {
    const itemStat = getStatFromAllItems(items, stat);
    const baseStat = getBaseStat(stat, classId, raceId);
    // TODO: buffs, talents, etc.
    return baseStat + itemStat;
}

export function calculateStat({
	items,
	raceId,
	classId,
	stat,
}: {
	items: LPItem[];
	raceId: string;
	classId: string;
	stat: StatName;
}) {
	switch (stat) {
		case "Health":
			return calculateHealth(items, raceId, classId);
		case "Mana":
			return calculateMana(items, raceId, classId);
        case "Armor":
            return calculateArmor(items, raceId, classId);
		default:
			return getStatFromAllItems(items, stat);
	}
}
