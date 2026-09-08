// Sim-based objective modes (TPS/DTPS/TMI/balanced) configure buffs through the "Advanced Sim
// Calibration" panel's RaidProfileSettings rather than the formula-mode BuffSection/buffs.ts list
// (which stays hidden and stuck at its all-unchecked default whenever a sim objective mode is
// active - see ConfigCard.tsx). This translates the subset of raidProfile buffs that matter for
// avoidance/uncrit constraints and the buffed-stats display into the same ModifierSource shape
// solveConfig.ts/SolverConfiguration already consume for formula mode, so a sim solve stops
// silently behaving as if the character has zero buffs.
//
// Only whole-fight stat buffs are translated - not procs, damage/threat multipliers, or
// short-cooldown effects, since none of those reduce to a {stat, flat|multiplier, value} triple
// the solver's avoidance/EHP math understands. Deliberately excluded (not missed):
//   - Thorns, Blessing of Sanctuary: proc-triggered effects, not stat buffs.
//   - Windfury Totem: a 20%-proc-chance temporary AP buff, not a constant.
//   - Bloodlust, Drums: short cooldowns, not up for the whole fight.
//   - Sanctity/Retribution/Concentration/Devotion Auras: threat or damage-taken multipliers,
//     not represented by any StatName.
// Debuffs are out of scope entirely - they modify the boss, not the player.
//
// Every value below is read from the real call sites in vendor/tbc-sim/sim/core/buffs.go's
// applyBuffEffects (not just the standalone aura constructors elsewhere), since some constructors
// take caster-side parameters (talent ranks, set bonuses on a hypothetical raid member) that
// applyBuffEffects hardcodes for a generic raid - e.g. Battle Shout's Booming Voice points and
// Solarian Sapphire prepull bonus have no field in RaidProfileSettings at all and are always 0/off
// at that call site, so this translator copies those hardcoded assumptions rather than the
// constructor's theoretical maximum.
import type { ModifierSource, Stat } from "#/solver/types";
import type { RaidProfileSettings, TristateEffect } from "#/types/SimCalibrationProfile";

const isImproved = (effect: TristateEffect): boolean =>
	effect === "TristateEffectImproved";

const tristateValue = (
	effect: TristateEffect,
	regular: number,
	improved: number,
): number => {
	if (effect === "TristateEffectMissing") return 0;
	return isImproved(effect) ? improved : regular;
};

function flat(name: Stat["name"], value: number): Stat {
	return { name, value, type: "flat" };
}

function multiplier(name: Stat["name"], value: number): Stat {
	return { name, value, type: "multiplier" };
}

// A buff whose stats compete with another buff's for the same (stat, exclusive-category) slot in
// the real sim - e.g. Gift of the Wild's Shadow Resistance component and Shadow Protection both
// occupy "shadow-resistance", and only the higher value actually applies (see buffs.go's
// registerExlusiveEffects/makeExclusiveFlatStatBuff, keyed by category+statName). `category` is
// this translator's own key, not required to match the Go source's literal string.
interface ExclusiveCandidate {
	category: string;
	source: ModifierSource;
	// the single stat's value this candidate contributes, used only to rank candidates within a
	// category - a candidate must contribute exactly one relevant stat to be comparable this way.
	value: number;
}

/**
 * Translates the buffs a sim-based solve's raid profile configures into the same
 * `ModifierSource[]` shape formula-mode's buffs list uses, so avoidance/uncrit constraints and
 * the buffed-stats display reflect what the raid profile actually configures instead of silently
 * defaulting to zero buffs. See this module's header comment for what's deliberately excluded.
 */
export function raidProfileToModifierSources(
	raidProfile: RaidProfileSettings,
): ModifierSource[] {
	const { raidBuffs, partyBuffs, individualBuffs } = raidProfile;
	const sources: ModifierSource[] = [];
	const exclusiveCandidates: ExclusiveCandidate[] = [];

	const addExclusive = (
		category: string,
		source: ModifierSource,
		value: number,
	) => {
		exclusiveCandidates.push({ category, source, value });
	};

	// --- Raid buffs ---

	if (raidBuffs.arcaneBrilliance) {
		sources.push({
			id: "arcane-brilliance",
			name: "Arcane Brilliance",
			type: "buff",
			stats: [flat("Intellect", 40)],
		});
	}

	if (raidBuffs.divineSpirit !== "TristateEffectMissing") {
		sources.push({
			id: "divine-spirit",
			name: "Divine Spirit",
			type: "buff",
			stats: [flat("Spirit", 50)],
		});
	}

	if (raidBuffs.powerWordFortitude !== "TristateEffectMissing") {
		const stamina = isImproved(raidBuffs.powerWordFortitude)
			? Math.floor(79 * 1.3)
			: 79;
		sources.push({
			id: "power-word-fortitude",
			name: "Power Word: Fortitude",
			type: "buff",
			stats: [flat("Stamina", stamina)],
		});
	}

	// Gift of the Wild's primary stats never collide with anything else this translator covers,
	// so they're pushed directly - only its resistance components are exclusive (below).
	if (raidBuffs.giftOfTheWild !== "TristateEffectMissing") {
		const improved = isImproved(raidBuffs.giftOfTheWild);
		const mod = improved ? 1.35 : 1.0;
		const statMod = Math.floor(14 * mod);
		sources.push({
			id: "gift-of-the-wild",
			name: "Gift of the Wild",
			type: "buff",
			stats: [
				flat("Armor", Math.floor(340 * mod)),
				flat("Stamina", statMod),
				flat("Strength", statMod),
				flat("Agility", statMod),
				flat("Intellect", statMod),
				flat("Spirit", statMod),
			],
		});
		const shadowResist = Math.floor(25 * mod);
		addExclusive(
			"shadow-resistance",
			{
				id: "gift-of-the-wild-shadow-resistance",
				name: "Gift of the Wild (Shadow Resistance)",
				type: "buff",
				stats: [flat("ShadowResistance", shadowResist)],
			},
			shadowResist,
		);
	}

	if (raidBuffs.shadowProtection) {
		addExclusive(
			"shadow-resistance",
			{
				id: "shadow-protection",
				name: "Shadow Protection",
				type: "buff",
				stats: [flat("ShadowResistance", 70)],
			},
			70,
		);
	}

	// --- Party buffs ---

	if (partyBuffs.strengthOfEarthTotem !== "TristateEffectMissing") {
		// Call site always passes hasEnh2pT4=false (no such field on RaidProfileSettings).
		const strength = isImproved(partyBuffs.strengthOfEarthTotem)
			? Math.floor(86 * 1.15)
			: 86;
		addExclusive(
			"strength-of-earth-totem",
			{
				id: "strength-of-earth-totem",
				name: "Strength of Earth Totem",
				type: "buff",
				stats: [flat("Strength", strength)],
			},
			strength,
		);
	}

	if (partyBuffs.graceOfAirTotem !== "TristateEffectMissing") {
		const agility = isImproved(partyBuffs.graceOfAirTotem)
			? Math.floor(77 * 1.15)
			: 77;
		addExclusive(
			"grace-of-air-totem",
			{
				id: "grace-of-air-totem",
				name: "Grace of Air Totem",
				type: "buff",
				stats: [flat("Agility", agility)],
			},
			agility,
		);
	}

	if (partyBuffs.battleShout !== "TristateEffectMissing") {
		// Call site always passes boomingVoicePoints=0, hasSolarianSapphire/hasT2 only affect the
		// pre-pull-only bonus (isPrepull branch), which this whole-fight translation ignores.
		const commandingPresenceMultiplier = tristateValue(
			partyBuffs.battleShout,
			1.0,
			1.25,
		);
		const attackPower = Math.floor(306 * commandingPresenceMultiplier);
		sources.push({
			id: "battle-shout",
			name: "Battle Shout",
			type: "buff",
			stats: [flat("AttackPower", attackPower)],
		});
	}

	// --- Individual buffs ---

	if (individualBuffs.blessingOfKings) {
		sources.push({
			id: "blessing-of-kings",
			name: "Blessing of Kings",
			type: "buff",
			stats: [
				multiplier("Stamina", 0.1),
				multiplier("Agility", 0.1),
				multiplier("Strength", 0.1),
				multiplier("Spirit", 0.1),
				multiplier("Intellect", 0.1),
			],
		});
	}

	if (individualBuffs.blessingOfMight !== "TristateEffectMissing") {
		const attackPower = isImproved(individualBuffs.blessingOfMight)
			? 220 * 1.2
			: 220;
		sources.push({
			id: "blessing-of-might",
			name: "Blessing of Might",
			type: "buff",
			stats: [
				flat("AttackPower", attackPower),
				flat("RangedAttackPower", attackPower),
			],
		});
	}

	if (individualBuffs.blessingOfWisdom !== "TristateEffectMissing") {
		const mp5 = isImproved(individualBuffs.blessingOfWisdom)
			? Math.floor(41 * 1.2)
			: 41;
		sources.push({
			id: "blessing-of-wisdom",
			name: "Blessing of Wisdom",
			type: "buff",
			stats: [flat("MP5", mp5)],
		});
	}

	// --- Resolve exclusive categories: only the highest-value candidate per category applies,
	// matching the real sim's ExclusiveEffect priority-wins behavior instead of naively summing
	// every enabled source.
	const byCategory = new Map<string, ExclusiveCandidate>();
	for (const candidate of exclusiveCandidates) {
		const existing = byCategory.get(candidate.category);
		if (!existing || candidate.value > existing.value) {
			byCategory.set(candidate.category, candidate);
		}
	}
	for (const candidate of byCategory.values()) {
		sources.push(candidate.source);
	}

	return sources;
}
