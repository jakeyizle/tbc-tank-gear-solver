// Turns a computeStats result into the numbers a tank actually reads.
//
// Ports the display formulas from vendor/tbc-sim/ui/core/player.tsx (getMissChanceInfo,
// getAvoidanceInfo, getCritImmunityInfo) so this app's panel agrees with wowsims' by
// construction rather than by coincidence. Everything here is arithmetic over a
// CharacterStatsBreakdown - no sim imports, so the solver may use it too.
//
// On the level-73 convention: these figures deliberately keep the level-70 base values and
// compare against a 102.4% uncrushable threshold, rather than subtracting 0.6 per avoidance
// type and comparing against 100%. See src/data/mechanics.ts.
import {
	armorDamageReduction,
	BLOCK_RATING_PER_BLOCK_PERCENT,
	DEFENSE_RATING_PER_DEFENSE_LEVEL,
	MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE,
	RESILIENCE_RATING_PER_CRIT_REDUCTION_CHANCE,
} from "#/data/mechanics";
import type { UnitStatsView } from "#/types/CharacterStats";

/** proto.Stat ordinals (vendor/tbc-sim/proto/common.proto). */
export const STAT = {
	Strength: 0,
	Agility: 1,
	Stamina: 2,
	Intellect: 3,
	HealingPower: 4,
	SpellDamage: 5,
	HolyDamage: 9,
	SpellHit: 12,
	SpellCrit: 13,
	Spirit: 16,
	AttackPower: 17,
	MeleeHit: 20,
	MeleeCrit: 21,
	Expertise: 24,
	DefenseRating: 25,
	BlockRating: 26,
	BlockValue: 27,
	DodgeRating: 28,
	ParryRating: 29,
	Resilience: 30,
	Armor: 31,
	BonusArmor: 32,
	Health: 33,
	Mana: 34,
	ArcaneResistance: 36,
	FireResistance: 37,
	FrostResistance: 38,
	NatureResistance: 39,
	ShadowResistance: 40,
} as const;

/** proto.PseudoStat ordinals. */
export const PSEUDO = {
	DodgePercent: 4,
	ParryPercent: 5,
	// Hit and crit are kept as real Stats in the sim back-end (so stat dependencies work) but
	// reported as PseudoStats - character.go:735-744. Reading these rather than the rating
	// stats is what folds in the conversions a rating alone does not carry: Intellect -> spell
	// crit (mana.go:47), Agility -> melee crit (paladin.go:127), and any talent that grants a
	// flat percentage.
	MeleeHitPercent: 12,
	SpellHitPercent: 13,
	MeleeCritPercent: 14,
	SpellCritPercent: 15,
	BlockPercent: 16,
	ReducedCritTakenPercent: 26,
} as const;

/** Base defense skill of a level-70 character, before any defense rating. */
export const BASE_DEFENSE_SKILL = 350;

/** Holy Shield's flat block-chance bonus, applied for Protection Paladins. */
export const HOLY_SHIELD_BLOCK_PERCENT = 30;

/** Libram of Repentance grants +42 block RATING while Holy Shield is up. */
export const LIBRAM_OF_REPENTANCE_ID = "29388";
const LIBRAM_OF_REPENTANCE_BLOCK_RATING = 42;

/** Crit chance a level-73 boss has against a level-70 player; the uncrittable requirement. */
export const CRIT_IMMUNITY_TARGET = 5.6;

export const stat = (view: UnitStatsView, index: number): number =>
	view.stats[index] ?? 0;
export const pseudo = (view: UnitStatsView, index: number): number =>
	view.pseudoStats[index] ?? 0;

/**
 * Effective defense SKILL: base 350 plus the FLOORED conversion of defense rating, because
 * the game only ever grants whole points.
 *
 * This deliberately disagrees with wowsims' character panel, which is wrong here. Its
 * character_stats.tsx computes rating / 2.365385 unrounded, adds the base, then formats with
 * toFixed(0) - i.e. it ROUNDS. A character with 359.31 rating has 151.90 points' worth, gets
 * the benefit of 151, and is shown "502" by wowsims where the true effective skill is 501.
 * Rounding up is the dangerous direction for a tank tool: defense breakpoints (490 for crit
 * immunity) are exactly where someone would be misled into thinking they had cleared one.
 * The sim's own combat math floors, so 501 is what actually applies.
 */
export function defenseSkill(view: UnitStatsView): number {
	return (
		BASE_DEFENSE_SKILL +
		Math.floor(
			stat(view, STAT.DefenseRating) / DEFENSE_RATING_PER_DEFENSE_LEVEL,
		)
	);
}

/** Avoidance percentage contributed by defense rating alone (excludes the base 350). */
export function defenseAvoidanceContribution(view: UnitStatsView): number {
	return (
		Math.floor(
			stat(view, STAT.DefenseRating) / DEFENSE_RATING_PER_DEFENSE_LEVEL,
		) * MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE
	);
}

export interface DebuffFlags {
	scorpidSting?: boolean;
	insectSwarm?: boolean;
}

/**
 * Debuff-supplied miss chance. Mirrors player.tsx: Scorpid Sting and Insect Swarm do not
 * stack, and Scorpid Sting wins.
 */
export function debuffMissChance(debuffs: DebuffFlags | undefined): number {
	if (debuffs?.scorpidSting) return 5;
	if (debuffs?.insectSwarm) return 2;
	return 0;
}

export interface MissChanceInfo {
	base: number;
	defense: number;
	debuffs: number;
	total: number;
}

/**
 * Base miss chance in the character-panel convention: player.tsx's getMissChanceInfo hardcodes
 * 5, keeping the level-70 value and pairing it with the 102.4% uncrushable threshold rather
 * than the combat-accurate 4.4% vs a 100% threshold. See src/data/mechanics.ts.
 */
export const DISPLAY_BASE_MISS_PERCENT = 5;

/** Port of player.tsx's getMissChanceInfo. Miss is not a pseudo-stat, so it is built here. */
export function missChanceInfo(
	view: UnitStatsView,
	debuffs?: DebuffFlags,
): MissChanceInfo {
	const base = DISPLAY_BASE_MISS_PERCENT;
	const defense = defenseAvoidanceContribution(view);
	const fromDebuffs = debuffMissChance(debuffs);
	return {
		base,
		defense,
		debuffs: fromDebuffs,
		total: base + defense + fromDebuffs,
	};
}

export interface AvoidanceInfo {
	miss: number;
	dodge: number;
	parry: number;
	block: number;
	/** miss + dodge + parry + block - compare against 102.4 for uncrushable. */
	total: number;
	/** Illidan's Shear ignores miss, so it is judged on dodge + parry + block alone. */
	shear: number;
	/** Dodge + parry + miss: avoidance that isn't block. See solveConfigForHardAvoidance. */
	hard: number;
}

export interface AvoidanceOptions {
	debuffs?: DebuffFlags;
	/** Holy Shield's +30% block only applies to a Protection Paladin. */
	isProtectionPaladin?: boolean;
	/** True when Libram of Repentance (29388) occupies the ranged slot. */
	hasLibramOfRepentance?: boolean;
}

/** Port of player.tsx's getAvoidanceInfo. */
export function avoidanceInfo(
	view: UnitStatsView,
	options: AvoidanceOptions = {},
): AvoidanceInfo {
	const miss = missChanceInfo(view, options.debuffs).total;
	const dodge = pseudo(view, PSEUDO.DodgePercent);
	const parry = pseudo(view, PSEUDO.ParryPercent);

	let block = pseudo(view, PSEUDO.BlockPercent);
	if (options.isProtectionPaladin) {
		block += HOLY_SHIELD_BLOCK_PERCENT;
		if (options.hasLibramOfRepentance) {
			block +=
				LIBRAM_OF_REPENTANCE_BLOCK_RATING / BLOCK_RATING_PER_BLOCK_PERCENT;
		}
	}

	return {
		miss,
		dodge,
		parry,
		block,
		total: miss + dodge + parry + block,
		shear: dodge + parry + block,
		hard: miss + dodge + parry,
	};
}

export interface CritImmunityInfo {
	total: number;
	/** Positive means still short of the cap; negative means over it. */
	delta: number;
	defense: number;
	resilience: number;
	/** Whatever the sim attributes beyond defense and resilience (e.g. talents). */
	talents: number;
}

/**
 * In-game physical damage reduction can never exceed 75%, even though armor/(armor+K) only
 * approaches 100% asymptotically. This is a DISPLAY clamp (matching the reference WeakAura);
 * effective HP is computed from the uncapped curve.
 */
export const ARMOR_DR_DISPLAY_CAP = 0.75;

export interface MitigationInfo {
	armor: number;
	/** Fraction, uncapped - the real curve. */
	armorReduction: number;
	/** Fraction, clamped to ARMOR_DR_DISPLAY_CAP - what the panel shows. */
	displayedArmorReduction: number;
	effectiveHealth: number;
}

/**
 * Armor mitigation and effective HP.
 *
 * Armor is `stats[Armor]` alone, NOT Armor + BonusArmor: the sim folds bonus armor into the
 * Armor stat via a stat dependency (paladin.go:129), so adding both counts every ring and
 * cloak twice.
 *
 * `physicalDamageTakenMultiplier` covers reductions that are not stats and therefore never
 * appear in computeStats output - today just Improved Righteous Fury. 1 means none.
 */
export function mitigationInfo(
	view: UnitStatsView,
	options: {
		attackerLevel?: number;
		physicalDamageTakenMultiplier?: number;
	} = {},
): MitigationInfo {
	const armor = stat(view, STAT.Armor);
	const armorReduction = armorDamageReduction(armor, options.attackerLevel);
	const damageTaken =
		(1 - armorReduction) * (options.physicalDamageTakenMultiplier ?? 1);
	return {
		armor,
		armorReduction,
		displayedArmorReduction: Math.min(armorReduction, ARMOR_DR_DISPLAY_CAP),
		effectiveHealth: stat(view, STAT.Health) / damageTaken,
	};
}

/** Port of player.tsx's getCritImmunityInfo. */
export function critImmunityInfo(view: UnitStatsView): CritImmunityInfo {
	const defense = defenseAvoidanceContribution(view);
	const resilience =
		stat(view, STAT.Resilience) / RESILIENCE_RATING_PER_CRIT_REDUCTION_CHANCE;
	// The pseudo-stat already includes every source, so talents are the remainder.
	const total = pseudo(view, PSEUDO.ReducedCritTakenPercent);
	return {
		total,
		delta: CRIT_IMMUNITY_TARGET - total,
		defense,
		resilience,
		talents: total - defense - resilience,
	};
}
