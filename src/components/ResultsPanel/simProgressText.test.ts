import { describe, expect, it } from "vitest";
import { simProgressText } from "./simProgressText";

describe("simProgressText", () => {
	it("returns undefined for a plain stats/ehp solve with no phase", () => {
		expect(simProgressText(undefined)).toBeUndefined();
		expect(simProgressText({ iteration: 1, maxIterations: 5 })).toBeUndefined();
	});

	it("formats a calibrating round with iteration and sim counts", () => {
		expect(
			simProgressText({
				iteration: 0,
				maxIterations: 1,
				phase: "calibrating",
				simIteration: 2,
				maxSimIterations: 5,
				calibrationCompletedIterations: 66546,
				calibrationTotalIterations: 72000,
				calibrationCompletedSims: 14,
				calibrationTotalSims: 22,
			}),
		).toBe(
			"Simulating round 3 of 5 (66,546 / 72,000 iterations, 14 / 22 sims)…",
		);
	});

	it("formats a calibrating round with no sim counts available", () => {
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
		).toBe("Simulating round 3 of 5 (66,546 / 72,000 iterations)…");
	});

	it("formats a calibrating round with no counts at all", () => {
		expect(
			simProgressText({
				iteration: 0,
				maxIterations: 1,
				phase: "calibrating",
				simIteration: 2,
				maxSimIterations: 5,
			}),
		).toBe("Simulating round 3 of 5…");
	});

	it("formats a measuring phase distinctly from calibrating/solving", () => {
		expect(
			simProgressText({
				iteration: 0,
				maxIterations: 1,
				phase: "measuring",
				simIteration: 4,
				maxSimIterations: 5,
				calibrationCompletedIterations: 1000,
				calibrationTotalIterations: 24000,
				calibrationCompletedSims: 1,
				calibrationTotalSims: 24,
			}),
		).toBe("Measuring final result (1,000 / 24,000 iterations, 1 / 24 sims)…");
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
});
