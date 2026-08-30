import { itemMeetsSocketBonus } from "#/solver/socketBonus";
import type {
	Buff,
	DisplayStatName,
	LPItem,
	ModifierSource,
	Stat,
	StatName,
} from "#/solver/types";
import {
	convertStatToPercentageOrSkill,
	convertStatToRating, 
} from "./convertStat";

const AVOIDANCE_PER_DEFENSE_SKILL = 0.04;

export const calculateStatValue = ({
	items,
	modifierSources,
	baseStats,
	statName,
	roundDefenseAndResilience = true,
}: {
	items: LPItem[];
	modifierSources: ModifierSource[];
	baseStats: Stat[];
	statName: DisplayStatName | "TotalHealth" | "TotalMana";
	roundDefenseAndResilience?: boolean;
}): number => {
	switch (statName) {
		case "TotalHealth":
			return calculateTotalHealth(items, modifierSources, baseStats);
		case "Health":
			return calculateHealth(items, modifierSources, baseStats);
		case "TotalMana":
			return calculateTotalMana(items, modifierSources, baseStats);
		case "Mana":
			return calculateMana(items, modifierSources, baseStats);
		case "Armor":
			return calculateArmor(items, modifierSources, baseStats);
		case "BlockValue":
			return calculateBlockValue(items, modifierSources, baseStats);
		case "SpellCrit":
			return calculateSpellCrit(items, modifierSources, baseStats);
		case "Avoidance":
			return calculateAvoidance(
				items,
				modifierSources,
				baseStats,
				roundDefenseAndResilience,
			);
		case "ShearAvoidance":
			return calculateShearAvoidance(
				items,
				modifierSources,
				baseStats,
				roundDefenseAndResilience,
			);
		case "Uncritability":
			return calculateUncritability(
				items,
				modifierSources,
				baseStats,
				roundDefenseAndResilience,
			);
		case "Effective HP":
			return calculateEffectiveHP(items, modifierSources, baseStats);
		case "Dodge":
			return calculateDodge(
				items,
				modifierSources,
				baseStats,
				roundDefenseAndResilience,
			);
		case "Parry":
			return calculateParry(
				items,
				modifierSources,
				baseStats,
				roundDefenseAndResilience,
			);
		case "Miss":
			return calculateMiss(
				items,
				modifierSources,
				baseStats,
				roundDefenseAndResilience,
			);
		case "Block":
			return calculateBlock(
				items,
				modifierSources,
				baseStats,
				roundDefenseAndResilience,
			);
		case "Stamina":
		case "Agility":
		case "Intellect":
		case "Spirit":
		case "Strength":
			return Math.floor(
				sumStatValue(items, modifierSources, statName, baseStats),
			);
		default:
			return sumStatValue(items, modifierSources, statName, baseStats);
	}
};

const sumStatValue = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	statName: StatName,
	baseStats: Stat[],
): number => {
	const itemStats = items
		.flatMap((x) => x.stats)
		.filter((x) => x.name === statName);
	const enchantStats = items
		.flatMap((x) => x.enchant)
		.flatMap((x) => x.stats)
		.filter((x) => x.name === statName);
	const gemStats = items
		.flatMap((x) => x.gems)
		.flatMap((x) => x.stats)
		.filter((x) => x.name === statName);
	const socketStats = items
		.flatMap((item) => (itemMeetsSocketBonus(item) ? item.socketBonus : []))
		.filter((x) => x.name === statName);

	const modifierSourceStats = modifierSources
		.flatMap((x) => getModifierSourceStats(x))
		.filter((x) => x.name === statName);

	const filteredBaseStats = baseStats.filter((x) => x.name === statName);

	const flatVal = sumFlatStats([
		...itemStats,
		...enchantStats,
		...gemStats,
		...socketStats,
		...modifierSourceStats,
		...filteredBaseStats,
	]);
	const multVal = sumMultiplierStats([
		...itemStats,
		...enchantStats,
		...gemStats,
		...socketStats,
		...modifierSourceStats,
		...filteredBaseStats,
	]);

	const sum = flatVal * multVal;
	return sum;
};

const getModifierSourceStats = (
	modifierSource: ModifierSource | Buff,
): Stat[] => {
	if ("checked" in modifierSource && !modifierSource.checked) return [];
	const rank = modifierSource.rank ?? 1;
	return modifierSource.stats.map((stat) => {
		return {
			...stat,
			value: stat.value * rank,
		};
	});
};

const sumFlatStats = (stats: Stat[]): number => {
	const flatStats = stats.filter((x) => x.type === "flat" || !x.type);
	return flatStats.reduce((acc, stat) => acc + stat.value, 0);
};

const sumMultiplierStats = (stats: Stat[]): number => {
	const multStats = stats.filter((x) => x.type === "multiplier");
	const values = multStats.map((x) => 1 + x.value);
	return values.reduce((acc, val) => acc * val, 1);
};

// The first 20 points of a stat contribute 1:1 to their derived resource, everything
// above that contributes at the given rate (matches mangos-tbc's GetHealthBonusFromStamina/
// GetManaBonusFromIntellect). Total Stamina/Intellect is always well above 20 for a real
// character, so this clamp only matters when computing the character's true total resource.
const calculateResourceFromStatWithClamp = (statValue: number, ratePastClamp: number): number => {
	const rounded = Math.floor(statValue);
	const clamped = Math.min(rounded, 20);
	const pastClamp = rounded - clamped;
	return clamped + pastClamp * ratePastClamp;
};

// Shared shape behind Health/Stamina and Mana/Intellect: a flat resource stat plus a
// derived amount from a driving stat, either clamped (the character's true total, used
// for TotalHealth/TotalMana) or linear (per-item scoring - see below).
const calculateResource = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
	resourceStatName: "Health" | "Mana",
	drivingStatName: "Stamina" | "Intellect",
	ratePastClamp: number,
	clamped: boolean,
): number => {
	const resource = sumStatValue(items, modifierSources, resourceStatName, baseStats);
	const drivingStat = calculateStatValue({
		items,
		modifierSources,
		statName: drivingStatName,
		baseStats,
	});
	const resourceFromDrivingStat = clamped
		? calculateResourceFromStatWithClamp(drivingStat, ratePastClamp)
		: drivingStat * ratePastClamp;
	return resource + resourceFromDrivingStat;
};

// calculateTotalHealth/calculateTotalMana are the true totals shown to the user (and used
// for EHP): they apply the 20-point clamp above once, against the character's full
// Stamina/Intellect. calculateHealth/calculateMana are the unclamped linear versions used
// when scoring an individual item's Stamina/Intellect contribution - since a character's
// base Stamina/Intellect always exceeds 20 already, any an item adds is necessarily past
// the clamp and always worth the flat per-point rate, so the linear (unclamped) formula is
// what the solver's per-item scoring needs.
const calculateTotalHealth = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
): number => calculateResource(items, modifierSources, baseStats, "Health", "Stamina", 10, true);

const calculateHealth = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
): number => calculateResource(items, modifierSources, baseStats, "Health", "Stamina", 10, false);

const calculateTotalMana = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
): number => calculateResource(items, modifierSources, baseStats, "Mana", "Intellect", 15, true);

const calculateMana = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
): number => calculateResource(items, modifierSources, baseStats, "Mana", "Intellect", 15, false);

const calculateArmor = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
): number => {
	const armor = sumStatValue(items, modifierSources, "Armor", baseStats);
	const agility = calculateStatValue({items, modifierSources, statName: "Agility", baseStats});
	const armorFromAgility = agility * 2;
	return Math.floor(armor + armorFromAgility);
};

const calculateBlockValue = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
): number => {
	const blockValue = sumStatValue(items, modifierSources, "BlockValue", baseStats);
	const strength = calculateStatValue({items, modifierSources, statName: "Strength", baseStats});
	const blockValueFromStrength = strength / 20;
	return blockValue + blockValueFromStrength;
};

const calculateSpellCrit = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
): number => {
	const spellCrit = sumStatValue(items, modifierSources, "SpellCrit", baseStats);
	const intellect = calculateStatValue({items, modifierSources, statName: "Intellect", baseStats});
	const spellCritPercentFromIntellect = intellect / 79.4;
	const spellCritRatingFromIntellect = convertStatToRating({
		name: "SpellCrit",
		value: spellCritPercentFromIntellect,
		type: "flat",
	});
	return spellCrit + spellCritRatingFromIntellect;
};

const calculateDodge = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
	roundDefenseAndResilience: boolean,
): number => {
	const dodge = sumStatValue(items, modifierSources, "Dodge", baseStats);
	// TODO: put defense conversion somewhere
	// yeah this is fucked up
	const defenseRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Defense",
		baseStats,
	});
	const defenseSkill = convertStatToPercentageOrSkill(
		{ name: "Defense", value: defenseRating, type: "flat" },
		roundDefenseAndResilience,
	);
	const dodgePercentFromDefense = defenseSkill * AVOIDANCE_PER_DEFENSE_SKILL;
	const dodgeRatingFromDefense = convertStatToRating({
		name: "Dodge",
		value: dodgePercentFromDefense,
		type: "flat",
	});

	const agility = calculateStatValue({
		items,
		modifierSources,
		statName: "Agility",
		baseStats,
	});
	const dodgePercentFromAgility = convertStatToPercentageOrSkill({
		name: "Agility",
		value: agility,
		type: "flat",
	});
	const dodgeRatingFromAgility = convertStatToRating({
		name: "Dodge",
		value: dodgePercentFromAgility,
		type: "flat",
	});
	return dodge + dodgeRatingFromAgility + dodgeRatingFromDefense;
};

const calculateParry = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
	roundDefenseAndResilience: boolean,
): number => {
	const parry = sumStatValue(items, modifierSources, "Parry", baseStats);
	// TODO: put defense conversion somewhere
	// yeah this is fucked up
	const defenseRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Defense",
		baseStats,
	});
	const defenseSkill = convertStatToPercentageOrSkill(
		{ name: "Defense", value: defenseRating, type: "flat" },
		roundDefenseAndResilience,
	);
	const parryPercentFromDefense = defenseSkill * AVOIDANCE_PER_DEFENSE_SKILL;
	const parryRatingFromDefense = convertStatToRating({
		name: "Parry",
		value: parryPercentFromDefense,
		type: "flat",
	});
	return parry + parryRatingFromDefense;
};

const calculateBlock = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
	roundDefenseAndResilience: boolean,
): number => {
	const block = sumStatValue(items, modifierSources, "Block", baseStats);
	// TODO: put defense conversion somewhere
	// yeah this is fucked up
	const defenseRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Defense",
		baseStats,
	});
	const defenseSkill = convertStatToPercentageOrSkill(
		{ name: "Defense", value: defenseRating, type: "flat" },
		roundDefenseAndResilience,
	);
	const blockPercentFromDefense = defenseSkill * AVOIDANCE_PER_DEFENSE_SKILL;
	const blockRatingFromDefense = convertStatToRating({
		name: "Block",
		value: blockPercentFromDefense,
		type: "flat",
	});
	return block + blockRatingFromDefense;
};

// unlike other stats, miss is only in percent - there is no miss rating
const calculateMiss = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
	roundDefenseAndResilience: boolean,
): number => {
	const miss = sumStatValue(items, modifierSources, "Miss", baseStats);
	const defenseRating = calculateStatValue({
		items,
		modifierSources,
		statName:"Defense",
		baseStats,
});
	const defenseSkill = convertStatToPercentageOrSkill(
		{ name: "Defense", value: defenseRating, type: "flat" },
		roundDefenseAndResilience,
	);
	const missPercentFromDefense = defenseSkill * AVOIDANCE_PER_DEFENSE_SKILL;
	return miss + missPercentFromDefense;
};

const calculateUncritability = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
	roundDefenseAndResilience: boolean,
): number => {
	const defenseRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Defense",
		baseStats,
	});
	const resilienceRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Resilience",
		baseStats,
	});

	const defenseSkill = convertStatToPercentageOrSkill(
		{
			name: "Defense",
			value: defenseRating,
			type: "flat",
		},
		roundDefenseAndResilience,
	);
	const resilienceSkill = convertStatToPercentageOrSkill(
		{
			name: "Resilience",
			value: resilienceRating,
			type: "flat",
		},
		roundDefenseAndResilience,
	);

	const uncritabilityFromDefense = defenseSkill * 0.04;
	return uncritabilityFromDefense + resilienceSkill;
};

const calculateDodgeParryBlock = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
	roundDefenseAndResilience: boolean,
): number => {
	const dodgeRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Dodge",
		baseStats,
		roundDefenseAndResilience,
	});
	const parryRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Parry",
		baseStats,
		roundDefenseAndResilience,
	});
	const blockRating = calculateStatValue({
		items,
		modifierSources,
		statName: "Block",
		baseStats,
		roundDefenseAndResilience,
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

	return dodge + parry + block;
};

const calculateAvoidance = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
	roundDefenseAndResilience: boolean,
): number => {
	const dodgeParryBlock = calculateDodgeParryBlock(
		items,
		modifierSources,
		baseStats,
		roundDefenseAndResilience,
	);
	const miss = calculateStatValue({
		items,
		modifierSources,
		statName: "Miss",
		baseStats,
		roundDefenseAndResilience,
	});

	return dodgeParryBlock + miss;
};

// Illidan Shear ignores Miss chance, unlike the standard uncrushable check
const calculateShearAvoidance = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
	roundDefenseAndResilience: boolean,
): number => {
	return calculateDodgeParryBlock(
		items,
		modifierSources,
		baseStats,
		roundDefenseAndResilience,
	);
};

const calculateEffectiveHP = (
	items: LPItem[],
	modifierSources: ModifierSource[],
	baseStats: Stat[],
): number => {
	const health = calculateStatValue({
		items,
		modifierSources,
		statName: "Health",
		baseStats,
	});
	const armor = calculateStatValue({
		items,
		modifierSources,
		statName: "Armor",
		baseStats,
	});
	const armorDR = convertStatToPercentageOrSkill({
		name: "Armor",
		value: armor,
		type: "flat",
	});
	return health / (1 - armorDR);
};
