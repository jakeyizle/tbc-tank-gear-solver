// Fixed starting point for round 1 of a sim-backed solve's calibration loop (see
// solveSimMetric.ts) - copied verbatim from tbc-new's own P3 Protection Paladin gear preset
// (vendor/tbc-sim/ui/paladin/protection/gear_sets/p3.gear.json). Calibration is a local
// approximation around whatever gear it's centered on (see calibrateWeights.ts), so this
// only needs to be "a reasonable mid-tier Protection Paladin," not the correct answer.
import type { GearPiece } from "./toTbcItemSpec";

function gear(id: number, enchant?: number, gems: number[] = []): GearPiece {
	return {
		id: String(id),
		enchant: { id: enchant ? String(enchant) : "" },
		gemSlots: gems.map(String),
	};
}

export const PROT_PALADIN_BASELINE_GEAR: GearPiece[] = [
	gear(32521, 3002, [25896, 32196]),
	gear(32362),
	gear(30998, 2991, [32200, 32196]),
	gear(34010, 2622),
	gear(30991, 2659, [32196, 32196, 32221]),
	gear(32279, 2650),
	gear(30985, 2613, [32196]),
	gear(32342, undefined, [32200, 32200]),
	gear(30995, 2748, [32200]),
	gear(32245, 2940, [32200, 32200]),
	gear(32261, 2928),
	gear(29172, 2928),
	gear(31858),
	gear(32489),
	gear(30910, 2669),
	gear(32375, 1071),
	gear(32368),
];
