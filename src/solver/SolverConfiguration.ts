import {
	calculateAvoidanceTarget,
	calculateBaseAvoidance,
	calculateBaseUncritability,
	calculateUncritabilityTarget,
} from "./avoidance";
import type { Stat } from "./types";

/**
 * Centralized configuration object that encapsulates all solver settings
 * and provides derived calculations. Eliminates the need to pass multiple
 * parameters through function call chains.
 */
export class SolverConfiguration {
	readonly uncrushabilitySetting: number;
	readonly uncritabilitySetting: number;
	readonly optimizeStats: Stat[];
	readonly raceId: string;
	readonly classId: string;

	// Derived values
	readonly avoidanceTarget: number;
	readonly uncritabilityTarget: number;
	readonly baseAvoidance: number;
	readonly baseUncritability: number;

	constructor(options: {
		uncrushabilitySetting: number;
		uncritabilitySetting: number;
		optimizeStats: Stat[];
		raceId: string;
		classId: string;
	}) {
		this.uncrushabilitySetting = options.uncrushabilitySetting;
		this.uncritabilitySetting = options.uncritabilitySetting;
		this.optimizeStats = options.optimizeStats;
		this.raceId = options.raceId;
		this.classId = options.classId;

		// Calculate derived values once during construction
		this.baseAvoidance = calculateBaseAvoidance(this.raceId, this.classId);
		this.avoidanceTarget = calculateAvoidanceTarget(
			this.uncrushabilitySetting,
            this.baseAvoidance,
		);

        this.baseUncritability = calculateBaseUncritability(this.classId);
		this.uncritabilityTarget = calculateUncritabilityTarget(
			this.uncritabilitySetting,
            this.baseUncritability
		);

		
	}
}
