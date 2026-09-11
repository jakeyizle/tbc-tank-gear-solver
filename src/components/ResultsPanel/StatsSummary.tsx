import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
	avoidanceInfo,
	critImmunityInfo,
	defenseSkill,
	LIBRAM_OF_REPENTANCE_ID,
	mitigationInfo,
	PSEUDO,
	STAT,
	pseudo as simPseudo,
	stat as simStat,
} from "#/helpers/characterStatsDisplay";
import type { LPItem, Stat } from "#/solver/types";
import type { CharacterStatsSnapshot } from "#/types/CharacterStats";
import type { SimMetricsSnapshot } from "#/types/SimCalibrationProfile";
import type { BaseConfig } from "#/types/SolverConfig";
import StatsGroup from "./StatsGroup";
import StatWeightTabs from "./StatWeightTabs";

interface StatsSummaryProps {
	items: LPItem[];
	baseConfig: BaseConfig;
	includeBuffsConsumables: boolean;
	simMetrics?: SimMetricsSnapshot;
	perMetricStatWeights?: Record<"tps" | "dtps" | "tmi", Stat[]>;
	perMetricStatWeightStdevs?: Record<"tps" | "dtps" | "tmi", Stat[]>;
	/** The simulator's own stats for this gear. Absent only for pre-existing saved results. */
	characterStats?: CharacterStatsSnapshot;
	/**
	 * Non-stat physical damage reduction (Improved Righteous Fury), captured at solve time - see
	 * SolveResult.physicalDamageTakenMultiplier. Absent only for pre-existing saved results.
	 */
	physicalDamageTakenMultiplier?: number;
}

/** Class id for Paladin, per #/data/classes.ts. Gates Holy Shield's block bonus. */
const PALADIN_CLASS_ID = "2";

export default function StatsSummary({
	items: rawItems,
	baseConfig,
	includeBuffsConsumables,
	simMetrics,
	perMetricStatWeights,
	perMetricStatWeightStdevs,
	characterStats,
	physicalDamageTakenMultiplier,
}: StatsSummaryProps) {
	if (!rawItems || rawItems.length === 0) {
		return null;
	}

	// Every number below is the simulator's own, via computeStats (see
	// src/sim/measureCharacterStats.ts). There is deliberately no fallback: the hand-written
	// stat engine that used to back this panel is gone, and inventing numbers for a result
	// saved before the sim measured them would be worse than saying so.
	const view = includeBuffsConsumables
		? characterStats?.buffed.final
		: characterStats?.unbuffed.final;
	if (!view) {
		return (
			<Box sx={{ p: 1.75, borderRadius: 1, bgcolor: "action.hover" }}>
				<Typography variant="body2" color="text.secondary">
					This result was saved before stats were measured by the simulator.
					Re-run the solve to see them.
				</Typography>
			</Box>
		);
	}

	const defenseRating = simStat(view, STAT.DefenseRating);
	const dodgeRating = simStat(view, STAT.DodgeRating);
	const parryRating = simStat(view, STAT.ParryRating);
	const blockRating = simStat(view, STAT.BlockRating);

	// Debuffs are raid-supplied, so they belong to the "include buffs & consumables" view
	// only - Insect Swarm's 2% miss is no more the character's own than Blessing of Kings is.
	const displayDebuffs = includeBuffsConsumables
		? baseConfig.simCalibrationProfile?.raidProfile?.debuffs
		: undefined;
	const avoidance = avoidanceInfo(view, {
		debuffs: displayDebuffs,
		isProtectionPaladin: baseConfig.classId === PALADIN_CLASS_ID,
		hasLibramOfRepentance: rawItems.some(
			(item) => item.id === LIBRAM_OF_REPENTANCE_ID,
		),
	});
	const critImmunity = critImmunityInfo(view);

	const headlineStats = [
		{ name: "Avoidance", value: avoidance.total },
		{ name: "Shear", value: avoidance.shear },
		// Dodge% + Parry% + Miss% - the subset of avoidance that counts toward uncrushable,
		// excluding Block (see solveEHP.ts's solveConfigForHardAvoidance, which optimizes
		// exactly this).
		{ name: "Hard Avoidance", value: avoidance.hard },
		{ name: "Uncrit", value: critImmunity.total },
	];

	const resilienceRating = simStat(view, STAT.Resilience);
	const spellHitRating = simStat(view, STAT.SpellHit);
	const spellCritRating = simStat(view, STAT.SpellCrit);

	const mitigation = mitigationInfo(view, {
		// 1 for results saved before the solver recorded this, which under-reports Effective HP
		// rather than inventing a reduction the solve may not have had.
		physicalDamageTakenMultiplier: physicalDamageTakenMultiplier ?? 1,
	});

	const mitigationStats = [
		{ name: "Health", value: simStat(view, STAT.Health) },
		{ name: "Armor", value: mitigation.armor },
		{
			name: "Armor DR",
			value: mitigation.displayedArmorReduction * 100,
			unit: "%" as const,
		},
		{ name: "Effective HP", value: Math.trunc(mitigation.effectiveHealth) },
		{
			name: "Defense",
			value: defenseSkill(view),
			rating: defenseRating,
		},
		{
			name: "Dodge",
			value: avoidance.dodge,
			unit: "%" as const,
			rating: dodgeRating,
		},
		{
			name: "Parry",
			value: avoidance.parry,
			unit: "%" as const,
			rating: parryRating,
		},
		{
			name: "Block",
			value: avoidance.block,
			unit: "%" as const,
			rating: blockRating,
		},
		// Total block value, including the portion derived from Strength. wowsims' own panel
		// omits that portion; a tank wants the number that actually reduces a blocked hit.
		{ name: "Block Value", value: simStat(view, STAT.BlockValue) },
		{ name: "Miss", value: avoidance.miss, unit: "%" as const },
		{
			name: "Resilience",
			value: critImmunity.resilience,
			unit: "%" as const,
			rating: resilienceRating,
		},
	];

	const threatStats = [
		{ name: "Spell Power", value: simStat(view, STAT.SpellDamage) },
		// Raw character attack power. wowsims' panel instead folds in debuff-derived AP
		// (Improved Hunter's Mark, Expose Weakness) using an assumed hunter agility, which
		// makes the number shift with raid composition rather than with this character's gear.
		{ name: "Attack Power", value: simStat(view, STAT.AttackPower) },
		{
			name: "Spell Hit",
			// The percent, not rating/divisor: the pseudo-stat carries talent- and
			// buff-supplied hit that never existed as rating (character.go:735).
			value: simPseudo(view, PSEUDO.SpellHitPercent),
			unit: "%" as const,
			rating: spellHitRating,
		},
		{
			name: "Spell Crit",
			// Likewise - and this one is visibly wrong without it, since a Paladin's spell crit
			// is mostly Intellect-derived (mana.go:47) and so carries no rating at all.
			value: simPseudo(view, PSEUDO.SpellCritPercent),
			unit: "%" as const,
			rating: spellCritRating,
		},
		{ name: "Mana", value: simStat(view, STAT.Mana) },
	];

	const staminaValue = simStat(view, STAT.Stamina);
	const intellectValue = simStat(view, STAT.Intellect);
	const baseStatRows = [
		{ name: "Strength", value: simStat(view, STAT.Strength) },
		{ name: "Agility", value: simStat(view, STAT.Agility) },
		{ name: "Stamina", value: staminaValue },
		{ name: "Intellect", value: intellectValue },
		{ name: "Spirit", value: simStat(view, STAT.Spirit) },
	];

	// simMetrics is now measured for every objective mode (see solver.worker.ts), so this just
	// waits for it to be present - e.g. still-in-flight solves, or old cached results from
	// before this was added.
	const showSimMetrics = simMetrics != null;
	const simMetricStats = showSimMetrics
		? [
				{ name: "TPS", value: simMetrics.tps },
				{ name: "DTPS", value: simMetrics.dtps },
				{ name: "TMI-5", value: simMetrics.tmi5 },
			]
		: [];
	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				gap: 2,
				p: 1.75,
				borderRadius: 1,
				bgcolor: "action.hover",
			}}
		>
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: `repeat(${headlineStats.length}, 1fr)`,
					// Labels/values are placed on their own explicit grid rows (rather than each
					// stat being its own independent label-over-value column) so a longer label
					// like "Hard Avoidance" can wrap to two lines without pushing just its own
					// value down - every value still starts on the same row 2 grid line, so the
					// numbers stay aligned across all headline stats regardless of label length.
					gridTemplateRows: "auto auto",
					columnGap: 2,
					rowGap: 0.25,
					borderRadius: 1,
					bgcolor: "background.paper",
					border: 1,
					borderColor: "divider",
					p: 1.25,
				}}
			>
				{headlineStats.slice(1).map((s, i) => (
					<Box
						key={`${s.name}-divider`}
						sx={{
							gridColumn: i + 2,
							gridRow: "1 / 3",
							justifySelf: "start",
							ml: -1,
							borderLeft: 1,
							borderColor: "divider",
						}}
					/>
				))}
				{headlineStats.map((s, i) => (
					<Typography
						key={`${s.name}-label`}
						variant="overline"
						color="text.secondary"
						sx={{
							lineHeight: 1.3,
							gridColumn: i + 1,
							gridRow: 1,
							alignSelf: "end",
							minWidth: 0,
						}}
					>
						{s.name}
					</Typography>
				))}
				{headlineStats.map((s, i) => (
					<Typography
						key={`${s.name}-value`}
						variant="h5"
						color="primary.light"
						fontWeight={700}
						sx={{
							whiteSpace: "nowrap",
							gridColumn: i + 1,
							gridRow: 2,
							minWidth: 0,
						}}
					>
						{s.value.toLocaleString(undefined, {
							minimumFractionDigits: s.value % 1 === 0 ? 0 : 2,
							maximumFractionDigits: s.value % 1 === 0 ? 0 : 2,
						})}
					</Typography>
				))}
			</Box>

			{/*
			 * The "Buffs included" chip row used to sit here. It listed the formula engine's
			 * buff objects, which described neither what the sim applied nor what the user had
			 * enabled once the raid profile became the real source - so it was removed rather
			 * than ported. Its replacement is owed by the config-model collapse (Phase 4),
			 * which is where a single authoritative list of active buffs will exist.
			 */}

			{showSimMetrics && (
				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: `repeat(${simMetricStats.length}, 1fr)`,
						gap: 1,
						borderRadius: 1,
						bgcolor: "background.paper",
						border: 1,
						borderColor: "divider",
						p: 1.25,
					}}
				>
					{simMetricStats.map((s) => (
						<Box key={s.name} sx={{ minWidth: 0 }}>
							<Typography
								variant="overline"
								color="text.secondary"
								sx={{ lineHeight: 1.5, whiteSpace: "nowrap" }}
							>
								{s.name}
							</Typography>
							<Typography
								variant="h5"
								color="secondary.light"
								fontWeight={700}
								sx={{ whiteSpace: "nowrap" }}
							>
								{s.value.toLocaleString(undefined, {
									maximumFractionDigits: 0,
								})}
							</Typography>
						</Box>
					))}
				</Box>
			)}

			{showSimMetrics && perMetricStatWeights && perMetricStatWeightStdevs && (
				<StatWeightTabs
					perMetricStatWeights={perMetricStatWeights}
					perMetricStatWeightStdevs={perMetricStatWeightStdevs}
				/>
			)}

			<StatsGroup header="Mitigation" stats={mitigationStats} showRating />
			<StatsGroup header="Threat" stats={threatStats} showRating />
			<StatsGroup
				header="Base Stats"
				stats={baseStatRows}
				defaultExpanded={false}
				collapsedSummary={`${Math.round(staminaValue).toLocaleString()} sta · ${Math.round(
					intellectValue,
				).toLocaleString()} int`}
			/>
		</Box>
	);
}
