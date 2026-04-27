import type {
	DisplayStatName,
	ItemVariation,
	ModifierSource,
	Stat,
	StatName,
} from "#/solver/types";
import { convertStatToPercentageOrSkill } from "./convertStat";

export const calculateStatValueForItem = ({
	item,
	statName,
}: {
	item: ItemVariation;
	statName: DisplayStatName;
}): number => {
	return calculateStatValue({ items: [item], modifierSources: [], statName });
};

export const calculateStatValue = ({
	items,
	modifierSources,
	statName,
}: {
	items: ItemVariation[];
	modifierSources: ModifierSource[];
	statName: DisplayStatName;
}): number => {
	switch (statName) {
		case "Health":
			return calculateHealth(items, modifierSources);
		case "Mana":
			return calculateMana(items, modifierSources);
		case "Armor":
			return calculateArmor(items, modifierSources);
		case "Avoidance":
			return calculateAvoidance(items, modifierSources);
		case "Uncritability":
			return calculateUncritability(items, modifierSources);
		case "Effective HP":
			return calculateEffectiveHP(items, modifierSources);
		case "Dodge":
			return calculateDodge(items, modifierSources);
		default:
			return sumStatValue(items, modifierSources, statName);
	}
};

const sumStatValue = (
	items: ItemVariation[],
	modifierSources: ModifierSource[],
	statName: StatName,
): number => {
	const itemStats = items
		.flatMap((x) => x.stats)
		.filter((x) => x.name === statName);

	const modifierSourceStats = modifierSources
		.flatMap((x) => getModifierSourceStats(x))
		.filter((x) => x.name === statName);

	const flatVal = sumFlatStats([...itemStats, ...modifierSourceStats]);
	const multVal = sumMultiplierStats([...itemStats, ...modifierSourceStats]);

	const sum = flatVal * multVal;
	return sum;
};

const getModifierSourceStats = (modifierSource: ModifierSource): Stat[] => {
	const rank = modifierSource.rank ?? 1;
	return modifierSource.stats.map((stat) => {
		return {
			...stat,
			value: stat.value * rank,
		};
	});
};

const sumFlatStats = (stats: Stat[]): number => {
	const flatStats = stats.filter((x) => x.type === "flat");
	return flatStats.reduce((acc, stat) => acc + stat.value, 0);
};

const sumMultiplierStats = (stats: Stat[]): number => {
	const multStats = stats.filter((x) => x.type === "multiplier");
	const values = multStats.map((x) => 1 + x.value);
	return values.reduce((acc, val) => acc * val, 1);
};

const calculateHealthFromStamina = (stamina: number): number => {
	// derived empirically - first 20 stam provides 1 hp each and stam is rounded down
	const staminaRounded = Math.floor(stamina);
	return (staminaRounded - 20) * 10 + 20;
};

const calculateHealth = (
	items: ItemVariation[],
	modifierSources: ModifierSource[],
): number => {
	// TODO: base health numbers are wrong - they are too high
	const health = sumStatValue(items, modifierSources, "Health");
	const stamina = sumStatValue(items, modifierSources, "Stamina");
	const healthFromStamina = calculateHealthFromStamina(stamina);
	return health + healthFromStamina;
};

const calculateMana = (
	items: ItemVariation[],
	modifierSources: ModifierSource[],
): number => {
    // TODO: base mana numbers are wrong - they are too high
	const mana = sumStatValue(items, modifierSources, "Mana");
	const intellect = sumStatValue(items, modifierSources, "Intellect");
	const manaFromIntellect = intellect * 15;
	return mana + manaFromIntellect;
};

const calculateArmor = (
	items: ItemVariation[],
	modifierSources: ModifierSource[],
): number => {
	const armor = sumStatValue(items, modifierSources, "Armor");
	const agility = sumStatValue(items, modifierSources, "Agility");
	const armorFromAgility = agility * 2;
	return Math.floor(armor + armorFromAgility);
};

const calculateDodge = (
	items: ItemVariation[],
	modifierSources: ModifierSource[],
): number => {
	const dodge = sumStatValue(items, modifierSources, "Dodge");
	const agility = sumStatValue(items, modifierSources, "Agility");
	// TODO: this based on class
	const dodgeFromAgility = agility / 25;
	return dodge + dodgeFromAgility;
};

const calculateUncritability = (
	items: ItemVariation[],
	modifierSources: ModifierSource[],
): number => {
	const defenseRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Defense",
	});
	const resilienceRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Resilience",
	});

	const defenseSkill = convertStatToPercentageOrSkill({
		name: "Defense",
		value: defenseRating,
		type: "flat",
	});
	const resilienceSkill = convertStatToPercentageOrSkill({
		name: "Resilience",
		value: resilienceRating,
		type: "flat",
	});

	const uncritabilityFromDefense = defenseSkill * 0.04;
	return uncritabilityFromDefense + resilienceSkill;
};

const calculateAvoidance = (
	items: ItemVariation[],
	modifierSources: ModifierSource[],
): number => {
	const dodgeRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Dodge",
	});
	const parryRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Parry",
	});
	const blockRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Block",
	});
	const defenseRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Defense",
	});

	const dodge = convertStatToPercentageOrSkill({
		name: "Dodge",
		value: dodgeRating,
		type: "flat",
	});
	const parry = convertStatToPercentageOrSkill({
		name: "Parry",
		value: parryRating,
		type: "flat",
	});
	const block = convertStatToPercentageOrSkill({
		name: "Block",
		value: blockRating,
		type: "flat",
	});
	const defense = convertStatToPercentageOrSkill({
		name: "Defense",
		value: defenseRating,
		type: "flat",
	});
	// TODO: figure out where the fuck to put this
	const avoidanceFromDefense = defense * 0.04 * 4;

	return dodge + parry + block + avoidanceFromDefense;
};

const calculateEffectiveHP = (
	items: ItemVariation[],
	modifierSources: ModifierSource[],
): number => {
	const health = calculateStatValue({
		items,
		modifierSources,
		statName: "Health",
	});
	const armor = calculateStatValue({
		items,
		modifierSources,
		statName: "Armor",
	});
	const armorDR = convertStatToPercentageOrSkill({
		name: "Armor",
		value: armor,
		type: "flat",
	});
	return health / (1 - armorDR);
};
