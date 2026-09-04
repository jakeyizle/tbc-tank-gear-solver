import { describe, expect, it } from "vitest";
import { simProgressText } from "./simProgressText";

describe("simProgressText", () => {
	it("returns undefined for a plain stats/ehp solve with no phase", () => {
		expect(simProgressText(undefined)).toBeUndefined();
		expect(simProgressText({ iteration: 1, maxIterations: 5 })).toBeUndefined();
	});

	it("formats a calibrating round with sim counts, no stage prefix outside the balance slider", () => {
		expect(
			simProgressText({
				iteration: 0,
				maxIterations: 1,
				phase: "calibrating",
				simIteration: 2,
				maxSimIterations: 5,
				calibrationCompletedIterations: 66546,
				calibrationTotalIterations: 72000,
			}),
		).toBe("Calibrating round 3 of 5 (66,546 / 72,000 sims)…");
	});

	it("formats a solving round", () => {
		expect(
			simProgressText({
				iteration: 0,
				maxIterations: 1,
				phase: "solving",
				simIteration: 0,
				maxSimIterations: 5,
			}),
		).toBe("Solving round 1 of 5…");
	});

	it("prefixes the stage label for a balance-slider solve, so a round count dropping back to 1 reads as a new phase, not a reset", () => {
		expect(
			simProgressText({
				iteration: 0,
				maxIterations: 1,
				phase: "calibrating",
				simIteration: 2,
				maxSimIterations: 5,
				stage: "threatEndpoint",
			}),
		).toBe("100% Threat — Calibrating round 3 of 5…");

		expect(
			simProgressText({
				iteration: 0,
				maxIterations: 1,
				phase: "calibrating",
				simIteration: 0,
				maxSimIterations: 5,
				stage: "survivalEndpoint",
			}),
		).toBe("100% Survivability — Calibrating round 1 of 5…");

		expect(
			simProgressText({
				iteration: 0,
				maxIterations: 1,
				phase: "solving",
				simIteration: 0,
				maxSimIterations: 5,
				stage: "balancing",
			}),
		).toBe("Balanced solve — Solving round 1 of 5…");
	});
});
