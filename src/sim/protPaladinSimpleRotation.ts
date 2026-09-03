// A plain-JSON port of tbc-new's `simpleRotation()` transform
// (vendor/tbc-sim/ui/paladin/protection/sim.ts:219-355), which compiles the "simple rotation"
// booleans (prioritize Holy Shield, consecration rank, etc.) into an actual APL rotation - the
// only rotation form the Go/wasm sim engine understands. protPaladinDefaultApl.ts's
// PROT_PALADIN_DEFAULT_APL is exactly this transform's output for `DefaultSimpleRotation`
// (see its own header comment), and - since every default boolean is a structural no-op against
// the base APL (matching spell ranks/ids already baked in, and this app's fixed talent build
// already having the Holy Shield talent but not Avenger's Shield) - it also doubles as the
// untransformed base template the original code mutates, so no separate "pre-transform" APL
// needs to be vendored.
//
// This operates on the same proto3-JSON plain-object shape as protPaladinDefaultApl.ts (no
// generated proto classes), unlike the original which manipulates generated protobuf message
// objects - the object paths below are the flattened-oneof equivalent of the original's
// `as any` traversal.
//
// Known simplification (see the "Talent gating" decision in this session): tbc-new's own code
// also forces `useAvengersShield`/`precastAvengersShield` to false unless the character's
// talent string actually has the Avenger's Shield talent - re-deriving that from an arbitrary
// user-edited talent string would require porting a second subsystem (a talent-string decoder).
// Since this app's fixed reference talent build doesn't have that talent either, both settings
// are hardcoded to `false` (matching today's actual behavior) rather than exposed as editable -
// see SimpleRotationSettings/RaidProfileFields.tsx. For the same reason, "Sanctity Aura" (which
// tbc-new falls back from when the Sanctity Aura talent is missing) is excluded from the aura
// picker's options entirely instead of being silently overridden.
import { PROT_PALADIN_DEFAULT_APL } from "./protPaladinDefaultApl";

export type SimpleRotationInput = {
	prioritizeHolyShield: boolean;
	consecrationRank: number;
	useExorcism: boolean;
	useHammerOfWrath: boolean;
	maintainJudgement: "JudgementNone" | "JudgementOfLight" | "JudgementOfWisdom";
	aura:
		| "AuraNone"
		| "DevotionAura"
		| "RetributionAura"
		| "ConcentrationAura"
		| "FireResistanceAura"
		| "FrostResistanceAura"
		| "ShadowResistanceAura";
};

// Fixed indices into PROT_PALADIN_DEFAULT_APL - see that file's own comment on why reordering
// it requires updating these (copied from sim.ts's identical constants).
const PREPULL_AURA_INDEX = 1;
const PRIORITY_JUDGE_ON_SEAL_INDEX = 1;
const PRIORITY_SWAP_SEAL_INDEX = 4;
const PRIORITY_CONSECRATION_INDEX = 6;
const PRIORITY_RIGHTEOUSNESS_JUDGE_INDEX = 7;

const CONSECRATION_RANK_SPELL_IDS: Record<number, number> = {
	1: 26573,
	2: 20116,
	3: 20922,
	4: 20923,
	5: 20924,
	6: 27173,
};

const AURA_SPELL_IDS: Record<SimpleRotationInput["aura"], number | null> = {
	AuraNone: null,
	DevotionAura: 27149,
	RetributionAura: 27150,
	ConcentrationAura: 19746,
	FireResistanceAura: 27153,
	FrostResistanceAura: 27152,
	ShadowResistanceAura: 27151,
};

const AURA_TAGS: Record<SimpleRotationInput["aura"], number> = {
	AuraNone: 0,
	DevotionAura: 0,
	RetributionAura: 0,
	ConcentrationAura: 0,
	FireResistanceAura: 1,
	FrostResistanceAura: 1,
	ShadowResistanceAura: 1,
};

interface JudgementSpec {
	sealSpellId: number;
	sealRank: number;
	judgementAuraSpellId: number;
	judgementAuraRank: number;
}

const JUDGEMENT_CONFIG: Record<
	SimpleRotationInput["maintainJudgement"],
	JudgementSpec | null
> = {
	JudgementNone: null,
	JudgementOfLight: {
		sealSpellId: 27160,
		sealRank: 5,
		judgementAuraSpellId: 27162,
		judgementAuraRank: 5,
	},
	JudgementOfWisdom: {
		sealSpellId: 27166,
		sealRank: 4,
		judgementAuraSpellId: 27164,
		judgementAuraRank: 4,
	},
};

// Mirrors the plain proto3-JSON shape, which has no generated type in this app (see
// buildStatWeightsRequest.ts's own plain-object convention).
// biome-ignore lint/suspicious/noExplicitAny: plain JSON shape, no generated type available.
type PlainApl = any;

/** Builds the APL rotation JSON to send in a calibration request from the simple-rotation UI settings. */
export function buildProtPaladinRotation(
	simple: SimpleRotationInput,
): PlainApl {
	const rotation: PlainApl = structuredClone(PROT_PALADIN_DEFAULT_APL);

	const {
		prioritizeHolyShield,
		consecrationRank,
		useExorcism,
		useHammerOfWrath,
		maintainJudgement,
		aura,
	} = simple;

	// Fixed per this session's talent-gating simplification - see this file's header comment.
	const useAvengersShield = false;

	const judgementConfig = JUDGEMENT_CONFIG[maintainJudgement];

	rotation.valueVariables = [
		{
			name: "Prioritize Holy Shield",
			value: { const: { val: String(prioritizeHolyShield) } },
		},
		{ name: "Use Exorcism", value: { const: { val: String(useExorcism) } } },
		{
			name: "Use Avenger's Shield",
			value: { const: { val: String(useAvengersShield) } },
		},
		{
			name: "Use Hammer of Wrath",
			value: { const: { val: String(useHammerOfWrath) } },
		},
		{
			name: "Maintain Judgement",
			value: { const: { val: String(!!judgementConfig) } },
		},
	];

	if (judgementConfig) {
		const judgeAnd =
			rotation.priorityList[PRIORITY_JUDGE_ON_SEAL_INDEX].action.condition.or
				.vals[0].and;
		const sealActiveAuraId = judgeAnd.vals[1].auraIsActive.auraId;
		sealActiveAuraId.spellId = judgementConfig.sealSpellId;
		sealActiveAuraId.rank = judgementConfig.sealRank;

		const swapAndVals =
			rotation.priorityList[PRIORITY_SWAP_SEAL_INDEX].action.condition.and.vals;
		const sealInactiveAuraId = swapAndVals[1].auraIsInactive.auraId;
		sealInactiveAuraId.spellId = judgementConfig.sealSpellId;
		sealInactiveAuraId.rank = judgementConfig.sealRank;
		const judgementInactiveAuraId = swapAndVals[2].auraIsInactive.auraId;
		judgementInactiveAuraId.spellId = judgementConfig.judgementAuraSpellId;
		judgementInactiveAuraId.rank = judgementConfig.judgementAuraRank;
		const swapSealCast =
			rotation.priorityList[PRIORITY_SWAP_SEAL_INDEX].action.castSpell.spellId;
		swapSealCast.spellId = judgementConfig.sealSpellId;
		swapSealCast.rank = judgementConfig.sealRank;

		const righteousnessAuraId =
			rotation.priorityList[PRIORITY_RIGHTEOUSNESS_JUDGE_INDEX].action.condition
				.and.vals[2].or.vals[1].cmp.lhs.auraRemainingTime.auraId;
		righteousnessAuraId.spellId = judgementConfig.judgementAuraSpellId;
		righteousnessAuraId.rank = judgementConfig.judgementAuraRank;
	}

	if (consecrationRank !== 0) {
		const consecrationCast =
			rotation.priorityList[PRIORITY_CONSECRATION_INDEX].action.castSpell
				.spellId;
		consecrationCast.spellId = CONSECRATION_RANK_SPELL_IDS[consecrationRank];
		consecrationCast.rank = consecrationRank;
	}

	const auraSpellId = AURA_SPELL_IDS[aura];
	if (auraSpellId !== null) {
		const auraCast =
			rotation.prepullActions[PREPULL_AURA_INDEX].action.castSpell.spellId;
		auraCast.spellId = auraSpellId;
		// rank is always 0 for an aura cast, and tag is 0 for every non-resistance aura -
		// proto3 JSON omits zero-valued fields (see PROT_PALADIN_DEFAULT_APL's other spellId
		// objects, which never write a zero rank/tag explicitly), so only set tag when it's
		// actually nonzero rather than always writing both fields.
		const tag = AURA_TAGS[aura];
		if (tag !== 0) {
			auraCast.tag = tag;
		}
	}

	rotation.priorityList = rotation.priorityList.filter(
		(_: unknown, i: number) =>
			!(i === PRIORITY_CONSECRATION_INDEX && consecrationRank === 0),
	);
	rotation.prepullActions = rotation.prepullActions.filter(
		(_: unknown, i: number) =>
			!(i === PREPULL_AURA_INDEX && auraSpellId === null),
	);

	return rotation;
}
