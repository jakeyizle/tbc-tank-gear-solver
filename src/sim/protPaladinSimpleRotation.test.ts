import { describe, expect, it } from "vitest";
import { PROT_PALADIN_DEFAULT_APL } from "./protPaladinDefaultApl";
import {
	buildProtPaladinRotation,
	type SimpleRotationInput,
} from "./protPaladinSimpleRotation";

// Minimal shapes for the plain-JSON fields these tests inspect - the rotation itself is
// untyped (see protPaladinSimpleRotation.ts's PlainApl), so callbacks over its arrays need an
// explicit (non-`any`) parameter type to satisfy both the linter and noImplicitAny.
interface PriorityEntry {
	action?: { castSpell?: { spellId?: { spellId?: number } } };
}
interface ValueVariable {
	name: string;
	value: { const: { val: string } };
}

const DEFAULT_SIMPLE_ROTATION: SimpleRotationInput = {
	prioritizeHolyShield: true,
	consecrationRank: 6,
	useExorcism: true,
	useHammerOfWrath: false,
	maintainJudgement: "JudgementNone",
	aura: "DevotionAura",
};

describe("buildProtPaladinRotation", () => {
	it("reproduces PROT_PALADIN_DEFAULT_APL exactly for the default settings", () => {
		// Every default boolean is a structural no-op against the base APL (see this file's
		// header comment) - this is the regression guard for that claim.
		expect(buildProtPaladinRotation(DEFAULT_SIMPLE_ROTATION)).toEqual(
			PROT_PALADIN_DEFAULT_APL,
		);
	});

	it("does not mutate the shared PROT_PALADIN_DEFAULT_APL constant", () => {
		const before = JSON.stringify(PROT_PALADIN_DEFAULT_APL);
		buildProtPaladinRotation({
			...DEFAULT_SIMPLE_ROTATION,
			consecrationRank: 0,
			aura: "AuraNone",
			maintainJudgement: "JudgementOfLight",
		});
		expect(JSON.stringify(PROT_PALADIN_DEFAULT_APL)).toBe(before);
	});

	it("drops the Consecration priority entry when consecrationRank is 0", () => {
		const rotation = buildProtPaladinRotation({
			...DEFAULT_SIMPLE_ROTATION,
			consecrationRank: 0,
		});
		expect(rotation.priorityList).toHaveLength(
			PROT_PALADIN_DEFAULT_APL.priorityList.length - 1,
		);
		const hasConsecration = rotation.priorityList.some(
			(entry: PriorityEntry) =>
				entry.action?.castSpell?.spellId?.spellId === 27173,
		);
		expect(hasConsecration).toBe(false);
	});

	it("swaps to a different Consecration rank's spell ID", () => {
		const rotation = buildProtPaladinRotation({
			...DEFAULT_SIMPLE_ROTATION,
			consecrationRank: 4,
		});
		const consecrationCast = rotation.priorityList[6].action.castSpell.spellId;
		expect(consecrationCast.spellId).toBe(20923);
		expect(consecrationCast.rank).toBe(4);
	});

	it("drops the prepull aura cast when aura is AuraNone", () => {
		const rotation = buildProtPaladinRotation({
			...DEFAULT_SIMPLE_ROTATION,
			aura: "AuraNone",
		});
		expect(rotation.prepullActions).toHaveLength(
			PROT_PALADIN_DEFAULT_APL.prepullActions.length - 1,
		);
	});

	it("swaps the prepull aura cast's spell ID and tag for a resistance aura", () => {
		const rotation = buildProtPaladinRotation({
			...DEFAULT_SIMPLE_ROTATION,
			aura: "ShadowResistanceAura",
		});
		const auraCast = rotation.prepullActions[1].action.castSpell.spellId;
		expect(auraCast.spellId).toBe(27151);
		expect(auraCast.tag).toBe(1);
	});

	it("rewrites the judgement/seal spell references for Judgement of Light", () => {
		const rotation = buildProtPaladinRotation({
			...DEFAULT_SIMPLE_ROTATION,
			maintainJudgement: "JudgementOfLight",
		});

		const maintainJudgementVar = rotation.valueVariables.find(
			(v: ValueVariable) => v.name === "Maintain Judgement",
		);
		expect(maintainJudgementVar.value.const.val).toBe("true");

		const sealActiveAuraId =
			rotation.priorityList[1].action.condition.or.vals[0].and.vals[1]
				.auraIsActive.auraId;
		expect(sealActiveAuraId).toEqual({ spellId: 27160, rank: 5 });

		const swapAndVals = rotation.priorityList[4].action.condition.and.vals;
		expect(swapAndVals[1].auraIsInactive.auraId).toEqual({
			spellId: 27160,
			rank: 5,
		});
		expect(swapAndVals[2].auraIsInactive.auraId).toEqual({
			spellId: 27162,
			rank: 5,
		});
		expect(swapAndVals[2].auraIsInactive.sourceUnit).toEqual({
			type: "CurrentTarget",
		});
		const swapSealCast = rotation.priorityList[4].action.castSpell.spellId;
		expect(swapSealCast).toEqual({ spellId: 27160, rank: 5 });

		const righteousnessAuraRemainingTime =
			rotation.priorityList[7].action.condition.and.vals[2].or.vals[1].cmp.lhs
				.auraRemainingTime;
		expect(righteousnessAuraRemainingTime.auraId).toEqual({
			spellId: 27162,
			rank: 5,
		});
		expect(righteousnessAuraRemainingTime.sourceUnit).toEqual({
			type: "CurrentTarget",
		});
	});

	it("leaves Maintain Judgement false and judgement spell IDs untouched for JudgementNone", () => {
		const rotation = buildProtPaladinRotation(DEFAULT_SIMPLE_ROTATION);
		const maintainJudgementVar = rotation.valueVariables.find(
			(v: ValueVariable) => v.name === "Maintain Judgement",
		);
		expect(maintainJudgementVar.value.const.val).toBe("false");
	});

	it("sets the Use Exorcism and Use Hammer of Wrath value variables from input", () => {
		const rotation = buildProtPaladinRotation({
			...DEFAULT_SIMPLE_ROTATION,
			useExorcism: false,
			useHammerOfWrath: true,
		});
		const byName = (name: string) =>
			rotation.valueVariables.find((v: ValueVariable) => v.name === name).value
				.const.val;
		expect(byName("Use Exorcism")).toBe("false");
		expect(byName("Use Hammer of Wrath")).toBe("true");
		// Fixed regardless of input - see this file's header comment on talent gating.
		expect(byName("Use Avenger's Shield")).toBe("false");
	});
});
