import { describe, expect, it } from "vitest";
import { PROT_PALADIN_DEFAULT_APL } from "./protPaladinDefaultApl";
import { PROT_PALADIN_TALENTS_STRING } from "./protPaladinProfile";
import {
	buildProtPaladinRotation,
	type SimpleRotationInput,
} from "./protPaladinSimpleRotation";

// PROT_PALADIN_TALENTS_STRING has both Holy Shield and Avenger's Shield (rank 1 each, at
// TALENT_STRING_POSITIONS["2"]'s "holy-shield"/"avengers-shield" indices) but not Sanctity Aura.
// This is the same string with Avenger's Shield's point removed (index 21: '1' -> '0').
const NO_AVENGERS_SHIELD_TALENTS = "-0530513050000142521050-052050003003";
// Same string with Holy Shield's point also removed (index 18: '1' -> '0').
const NO_HOLY_SHIELD_TALENTS = "-0530513050000142020051-052050003003";

// Minimal shapes for the plain-JSON fields these tests inspect - the rotation itself is
// untyped (see protPaladinSimpleRotation.ts's PlainApl), so callbacks over its arrays need an
// explicit (non-`any`) parameter type to satisfy both the linter and noImplicitAny.
interface PriorityEntry {
	action?: { castSpell?: { spellId?: { spellId?: number } } };
}
interface PrepullEntry {
	hide?: boolean;
	action?: { castSpell?: { spellId?: { spellId?: number } } };
	doAtValue?: { const?: { val?: string } };
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
	useAvengersShield: false,
	precastAvengersShield: false,
	maintainJudgement: "JudgementNone",
	aura: "DevotionAura",
};

describe("buildProtPaladinRotation", () => {
	it("reproduces PROT_PALADIN_DEFAULT_APL exactly for the default settings", () => {
		// Every default boolean is a structural no-op against the base APL (see this file's
		// header comment) - this is the regression guard for that claim.
		expect(
			buildProtPaladinRotation(
				DEFAULT_SIMPLE_ROTATION,
				PROT_PALADIN_TALENTS_STRING,
			),
		).toEqual(PROT_PALADIN_DEFAULT_APL);
	});

	it("does not mutate the shared PROT_PALADIN_DEFAULT_APL constant", () => {
		const before = JSON.stringify(PROT_PALADIN_DEFAULT_APL);
		buildProtPaladinRotation(
			{
				...DEFAULT_SIMPLE_ROTATION,
				consecrationRank: 0,
				aura: "AuraNone",
				maintainJudgement: "JudgementOfLight",
			},
			PROT_PALADIN_TALENTS_STRING,
		);
		expect(JSON.stringify(PROT_PALADIN_DEFAULT_APL)).toBe(before);
	});

	it("drops the Consecration priority entry when consecrationRank is 0", () => {
		const rotation = buildProtPaladinRotation(
			{
				...DEFAULT_SIMPLE_ROTATION,
				consecrationRank: 0,
			},
			PROT_PALADIN_TALENTS_STRING,
		);
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
		const rotation = buildProtPaladinRotation(
			{
				...DEFAULT_SIMPLE_ROTATION,
				consecrationRank: 4,
			},
			PROT_PALADIN_TALENTS_STRING,
		);
		const consecrationCast = rotation.priorityList[6].action.castSpell.spellId;
		expect(consecrationCast.spellId).toBe(20923);
		expect(consecrationCast.rank).toBe(4);
	});

	it("drops the prepull aura cast when aura is AuraNone", () => {
		const rotation = buildProtPaladinRotation(
			{
				...DEFAULT_SIMPLE_ROTATION,
				aura: "AuraNone",
			},
			PROT_PALADIN_TALENTS_STRING,
		);
		expect(rotation.prepullActions).toHaveLength(
			PROT_PALADIN_DEFAULT_APL.prepullActions.length - 1,
		);
	});

	it("swaps the prepull aura cast's spell ID and tag for a resistance aura", () => {
		const rotation = buildProtPaladinRotation(
			{
				...DEFAULT_SIMPLE_ROTATION,
				aura: "ShadowResistanceAura",
			},
			PROT_PALADIN_TALENTS_STRING,
		);
		const auraCast = rotation.prepullActions[1].action.castSpell.spellId;
		expect(auraCast.spellId).toBe(27151);
		expect(auraCast.tag).toBe(1);
	});

	it("rewrites the judgement/seal spell references for Judgement of Light", () => {
		const rotation = buildProtPaladinRotation(
			{
				...DEFAULT_SIMPLE_ROTATION,
				maintainJudgement: "JudgementOfLight",
			},
			PROT_PALADIN_TALENTS_STRING,
		);

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
		const rotation = buildProtPaladinRotation(
			DEFAULT_SIMPLE_ROTATION,
			PROT_PALADIN_TALENTS_STRING,
		);
		const maintainJudgementVar = rotation.valueVariables.find(
			(v: ValueVariable) => v.name === "Maintain Judgement",
		);
		expect(maintainJudgementVar.value.const.val).toBe("false");
	});

	it("sets the Use Exorcism and Use Hammer of Wrath value variables from input", () => {
		const rotation = buildProtPaladinRotation(
			{
				...DEFAULT_SIMPLE_ROTATION,
				useExorcism: false,
				useHammerOfWrath: true,
			},
			PROT_PALADIN_TALENTS_STRING,
		);
		const byName = (name: string) =>
			rotation.valueVariables.find((v: ValueVariable) => v.name === name).value
				.const.val;
		expect(byName("Use Exorcism")).toBe("false");
		expect(byName("Use Hammer of Wrath")).toBe("true");
	});

	describe("talent gating", () => {
		it("forces Use/Precast Avenger's Shield off when the talent string lacks the talent", () => {
			const rotation = buildProtPaladinRotation(
				{
					...DEFAULT_SIMPLE_ROTATION,
					useAvengersShield: true,
					precastAvengersShield: true,
				},
				NO_AVENGERS_SHIELD_TALENTS,
			);
			const byName = (name: string) =>
				rotation.valueVariables.find((v: ValueVariable) => v.name === name)
					.value.const.val;
			expect(byName("Use Avenger's Shield")).toBe("false");
			// Precast is a structural no-op here, so the prepull Avenger's Shield entry stays
			// hidden and the seal/Holy Shield prepull timings stay at their defaults.
			expect(rotation.prepullActions).toHaveLength(
				PROT_PALADIN_DEFAULT_APL.prepullActions.length,
			);
			expect((rotation.prepullActions as PrepullEntry[])[4].hide).toBe(true);
			expect(
				(rotation.prepullActions as PrepullEntry[])[2].doAtValue?.const?.val,
			).toBe("-3s");
			expect(
				(rotation.prepullActions as PrepullEntry[])[3].doAtValue?.const?.val,
			).toBe("-1.5s");
		});

		it("honors Use/Precast Avenger's Shield when the talent is present", () => {
			const rotation = buildProtPaladinRotation(
				{
					...DEFAULT_SIMPLE_ROTATION,
					useAvengersShield: true,
					precastAvengersShield: true,
				},
				PROT_PALADIN_TALENTS_STRING,
			);
			const byName = (name: string) =>
				rotation.valueVariables.find((v: ValueVariable) => v.name === name)
					.value.const.val;
			expect(byName("Use Avenger's Shield")).toBe("true");
			expect((rotation.prepullActions as PrepullEntry[])[4].hide).toBe(false);
			expect(
				(rotation.prepullActions as PrepullEntry[])[2].doAtValue?.const?.val,
			).toBe("-4s");
			expect(
				(rotation.prepullActions as PrepullEntry[])[3].doAtValue?.const?.val,
			).toBe("-2.5s");
		});

		it("falls Sanctity Aura back to AuraNone when the talent is absent", () => {
			const rotation = buildProtPaladinRotation(
				{ ...DEFAULT_SIMPLE_ROTATION, aura: "SanctityAura" },
				PROT_PALADIN_TALENTS_STRING,
			);
			expect(rotation.prepullActions).toHaveLength(
				PROT_PALADIN_DEFAULT_APL.prepullActions.length - 1,
			);
		});

		it("honors Sanctity Aura when the talent is present", () => {
			const withSanctityAura = "-0530513050000142521051-05205000300301";
			const rotation = buildProtPaladinRotation(
				{ ...DEFAULT_SIMPLE_ROTATION, aura: "SanctityAura" },
				withSanctityAura,
			);
			const auraCast = rotation.prepullActions[1].action.castSpell.spellId;
			expect(auraCast.spellId).toBe(20218);
		});

		it("forces Prioritize Holy Shield off when the talent string lacks Holy Shield", () => {
			const rotation = buildProtPaladinRotation(
				DEFAULT_SIMPLE_ROTATION,
				NO_HOLY_SHIELD_TALENTS,
			);
			const byName = (name: string) =>
				rotation.valueVariables.find((v: ValueVariable) => v.name === name)
					.value.const.val;
			expect(byName("Prioritize Holy Shield")).toBe("false");
		});
	});
});
