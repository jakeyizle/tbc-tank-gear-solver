// Measures the LP's stat model by asking the sim, instead of reimplementing TBC's stat math.
//
// The LP needs two things: what the character already has before it picks any gear (the base
// vector), and what one point of each stat is worth on every axis it constrains or maximizes
// (the coefficient matrix). Both used to come from src/helpers/stats.ts + src/data/baseStats.ts
// - a second, hand-written game engine that drifted from the vendored sim it ships alongside.
//
// Here they come from computeStats:
//   base         = computeStats(profile, no gear)
//   coefficient  = (computeStats(profile, bonus_stats={s: 1000}) - base) / 1000
//
// Finite differencing through the real character build is what makes the cross-terms fall out
// for free: Strength -> AttackPower/BlockValue, Agility -> Armor/DodgeRating, Stamina ->
// Health, Intellect -> Mana, and any talent-driven conversion (Holy Guidance's Intellect ->
// SpellDamage) are all just numbers in the resulting matrix. Nothing here knows they exist.
//
// ONE stat is not differenced - Defense, which the sim floors internally. See LinearStatModel's
// INVARIANT. Resilience looks like it belongs in the same bucket but does not: its crit
// reduction is an unfloored division (unit.go:945), so it differences cleanly.

import {
	BLOCK_RATING_PER_BLOCK_PERCENT,
	BOSS_LEVEL,
	DEFENSE_RATING_PER_DEFENSE_LEVEL,
	DODGE_RATING_PER_DODGE_PERCENT,
	MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE,
	PARRY_RATING_PER_PARRY_PERCENT,
} from "#/data/mechanics";
import { parseTalentsString } from "#/data/talents";
import { STAT_INDEX_TO_NAME } from "#/data/tbcDatabase";
import {
	DISPLAY_BASE_MISS_PERCENT,
	debuffMissChance,
	HOLY_SHIELD_BLOCK_PERCENT,
	PSEUDO,
	pseudo,
	stat,
} from "#/helpers/characterStatsDisplay";
import type { StatName } from "#/solver/types";
import type { UnitStatsView } from "#/types/CharacterStats";
import type {
	AxisVector,
	LinearAxis,
	LinearStatModel,
} from "#/types/LinearStatModel";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import { computeCharacterStats } from "./computeStatsClient";
import type { GearPiece } from "./toTbcItemSpec";

/**
 * How much of a stat to inject when differencing.
 *
 * Deliberately large. `applyAllEffects` runs `SortAndApplyStatDependencies(...).FloorGameStats()`
 * (character.go:281), so every measured stat is floored to a whole number. A delta of 1 would
 * quantize catastrophically (a 0.76 dodge-rating-per-agility slope would read as 0); a delta of
 * 1000 bounds the flooring error at 1/1000 of a point per unit, which is below every tolerance
 * anything downstream uses.
 */
const PROBE_DELTA = 1000;

/** proto.Stat index for each StatName, inverted from tbcDatabase's forward table. */
const STAT_INDEX_BY_NAME = (() => {
	const map = {} as Partial<Record<StatName, number>>;
	STAT_INDEX_TO_NAME.forEach((name, index) => {
		if (name && map[name] === undefined) map[name] = index;
	});
	return map;
})();

/**
 * Every stat this model carries a coefficient for: everything the sim has a proto.Stat for,
 * minus Defense (which floors internally - see the INVARIANT). Miss is absent because it has
 * no rating and no stat index; only defense feeds it.
 */
const PROBE_STATS: StatName[] = (
	Object.keys(STAT_INDEX_BY_NAME) as StatName[]
).filter((name) => name !== "Defense");

/** proto.WeaponType_WeaponTypeShield (common.proto). */
const WEAPON_TYPE_SHIELD = 7;

/**
 * Reads every axis off one computeStats result.
 *
 * Avoidance is built from dodge/parry/block RATING rather than from the dodge/parry/block
 * pseudo-percentages on purpose: `GetPseudoStatsProto` zeroes BlockPercent unless a shield is
 * equipped (character.go:716's `Ternary(CanBlock, ...)`), and the character being probed here
 * wears nothing. Rating is always reported, and rating -> percent is a plain division in TBC
 * (unit.go:879-925, no diminishing returns), so this is the same number by a route that does
 * not depend on what is equipped. The base vector reinstates the non-rating part separately -
 * see baseAvoidanceParts below.
 */
function axisValues(view: UnitStatsView): AxisVector {
	const out: AxisVector = {};
	for (const [name, index] of Object.entries(STAT_INDEX_BY_NAME) as [
		StatName,
		number,
	][]) {
		out[name] = stat(view, index);
	}
	// Miss has no rating and no proto.Stat - it comes from defense skill alone, which is
	// handled analytically.
	out.Miss = 0;

	const fromRating =
		(out.Dodge ?? 0) / DODGE_RATING_PER_DODGE_PERCENT +
		(out.Parry ?? 0) / PARRY_RATING_PER_PARRY_PERCENT +
		(out.Block ?? 0) / BLOCK_RATING_PER_BLOCK_PERCENT;
	out.Avoidance = fromRating;
	out.ShearAvoidance = fromRating;

	// Already the sum of every crit-reduction source the sim knows about, so probes that
	// happen to feed it (none today) would be picked up automatically rather than silently.
	out.Uncritability = pseudo(view, PSEUDO.ReducedCritTakenPercent);
	return out;
}

function defenseSkillOf(view: UnitStatsView): number {
	return Math.floor(
		stat(view, STAT_INDEX_BY_NAME.Defense ?? 0) /
			DEFENSE_RATING_PER_DEFENSE_LEVEL,
	);
}

/**
 * The avoidance the character has with nothing equipped, in the wowsims character-panel
 * convention (see src/data/mechanics.ts on the level-73 / 102.4% convention).
 *
 * The class's own base dodge/parry/block chances are PseudoStats, not Stats, and block's is
 * reported as zero without a shield. So this measures a second character wearing one reference
 * shield and subtracts that shield's own (fully known) contribution back out. Everything stays
 * sim-sourced; nothing hardcodes "paladins block 5%".
 */
async function baseAvoidanceParts(
	bare: UnitStatsView,
	db: TbcUiDatabase,
	profile: SimCalibrationProfile,
): Promise<{ dodge: number; parry: number; block: number; miss: number }> {
	const dodge = pseudo(bare, PSEUDO.DodgePercent);
	const parry = pseudo(bare, PSEUDO.ParryPercent);
	// The dodge/parry/block pseudo-stats already include the character's own defense skill
	// (character.go:714-716), but miss is not a pseudo-stat, so its defense term has to be
	// added here or the base would count defense three times instead of four.
	const miss =
		DISPLAY_BASE_MISS_PERCENT +
		debuffMissChance(
			profile.raidProfile.debuffs as
				| { scorpidSting?: boolean; insectSwarm?: boolean }
				| undefined,
		) +
		defenseSkillOf(bare) * MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE;

	const shieldId = findReferenceShieldId(db);
	if (shieldId === undefined) {
		// Without a shield there is no way to observe BaseBlockChance. Reporting 0 would
		// silently over-constrain every avoidance solve, so fail loudly instead.
		throw new Error(
			"deriveLinearModel: no shield found in the item database; cannot measure base block chance",
		);
	}

	const shielded = (
		await computeCharacterStats(
			[
				{ id: String(shieldId), enchant: { id: "" }, gemSlots: [] },
			] as GearPiece[],
			db,
			profile,
		)
	).final;

	const blockRatingFromShield =
		stat(shielded, STAT_INDEX_BY_NAME.Block ?? 0) -
		stat(bare, STAT_INDEX_BY_NAME.Block ?? 0);
	const defenseSkillFromShield =
		defenseSkillOf(shielded) - defenseSkillOf(bare);

	const block =
		pseudo(shielded, PSEUDO.BlockPercent) -
		blockRatingFromShield / BLOCK_RATING_PER_BLOCK_PERCENT -
		defenseSkillFromShield * MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE +
		// The one thing computeStats genuinely cannot report. Holy Shield is an ACTIVE aura a
		// Protection Paladin keeps up, not a build-phase stat, so it appears nowhere in the
		// stat vector - but a tank's uncrushable maths is entirely predicated on it, and
		// without it every avoidance floor is 30 points out of reach. wowsims' own character
		// panel adds it the same way (player.tsx's getAvoidanceInfo), which is where
		// HOLY_SHIELD_BLOCK_PERCENT is transcribed from.
		//
		// Libram of Repentance's +42 block rating (also conditional on Holy Shield) is NOT
		// here: it is an item the LP may or may not choose, and it reaches the model as an
		// ordinary item stat via src/solver/itemOverride.ts.
		HOLY_SHIELD_BLOCK_PERCENT;

	return { dodge, parry, block, miss };
}

/**
 * Lowest-id shield in the database. Which shield does not matter - its own stats are
 * subtracted back out - but picking deterministically keeps the derived model stable, and the
 * lowest id is a low-level shield, i.e. the least likely to carry an item effect.
 */
function findReferenceShieldId(db: TbcUiDatabase): number | undefined {
	let best: number | undefined;
	for (const raw of db.items) {
		const item = raw as { id?: number; weaponType?: number };
		if (item.weaponType !== WEAPON_TYPE_SHIELD || item.id === undefined)
			continue;
		if (best === undefined || item.id < best) best = item.id;
	}
	return best;
}

/** vendor/tbc-sim/sim/paladin/talents.go - Improved Righteous Fury, 2% damage taken per rank. */
const IMPROVED_RIGHTEOUS_FURY_DR_PER_RANK = 0.02;
const PALADIN_CLASS_ID = "2";

function physicalDamageTakenMultiplier(profile: SimCalibrationProfile): number {
	const ranks = parseTalentsString(
		PALADIN_CLASS_ID,
		profile.raidProfile.talentsString ?? "",
	);
	const rank = ranks["improved-righteous-fury"] ?? 0;
	return 1 - rank * IMPROVED_RIGHTEOUS_FURY_DR_PER_RANK;
}

/** Coefficients below this are float noise from the sim's internal flooring, not signal. */
const COEFFICIENT_EPSILON = 1e-9;

function differenceAxes(probe: AxisVector, base: AxisVector): AxisVector {
	const out: AxisVector = {};
	for (const key of Object.keys(probe) as LinearAxis[]) {
		const delta = ((probe[key] ?? 0) - (base[key] ?? 0)) / PROBE_DELTA;
		if (Math.abs(delta) > COEFFICIENT_EPSILON) out[key] = delta;
	}
	return out;
}

/**
 * Builds the LP's stat model for `profile`.
 *
 * Costs one computeStats call per probed stat plus two more (bare and shielded). computeStats
 * runs zero sim iterations and computeStatsClient memoizes on request content, so this is
 * seconds, not minutes - and it is derived once per solve, not once per candidate item.
 */
export async function deriveLinearModel(
	db: TbcUiDatabase,
	profile: SimCalibrationProfile,
): Promise<LinearStatModel> {
	const bare = (await computeCharacterStats([], db, profile)).final;
	const baseAxes = axisValues(bare);

	const probes = await Promise.all(
		PROBE_STATS.map(async (name) => {
			const index = STAT_INDEX_BY_NAME[name];
			if (index === undefined) return [name, {} as AxisVector] as const;
			const view = (
				await computeCharacterStats([], db, profile, { [index]: PROBE_DELTA })
			).final;
			return [name, differenceAxes(axisValues(view), baseAxes)] as const;
		}),
	);

	const coefficients: Partial<Record<StatName, AxisVector>> = {};
	for (const [name, vector] of probes) coefficients[name] = vector;

	const { dodge, parry, block, miss } = await baseAvoidanceParts(
		bare,
		db,
		profile,
	);
	const base: AxisVector = {
		...baseAxes,
		Miss: miss,
		Avoidance: miss + dodge + parry + block,
		ShearAvoidance: dodge + parry + block,
	};

	const perDefensePoint = MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE;
	return {
		base,
		coefficients,
		defense: {
			ratingPerPoint: DEFENSE_RATING_PER_DEFENSE_LEVEL,
			baseRating: stat(bare, STAT_INDEX_BY_NAME.Defense ?? 0),
			// No `Defense` entry: the Defense axis is the raw, unfloored rating, added by the
			// scorer directly. Only the derived axes below are quantized by the floor.
			perPoint: {
				Miss: perDefensePoint,
				// One point of defense skill adds the same percentage to all four avoidance
				// types, which is exactly why the uncrushable threshold is 102.4 and not 100 -
				// see src/data/mechanics.ts.
				Avoidance: perDefensePoint * 4,
				ShearAvoidance: perDefensePoint * 3,
				Uncritability: perDefensePoint,
				Dodge: perDefensePoint * DODGE_RATING_PER_DODGE_PERCENT,
				Parry: perDefensePoint * PARRY_RATING_PER_PARRY_PERCENT,
				Block: perDefensePoint * BLOCK_RATING_PER_BLOCK_PERCENT,
			},
		},
		attackerLevel: BOSS_LEVEL,
		physicalDamageTakenMultiplier: physicalDamageTakenMultiplier(profile),
	};
}
