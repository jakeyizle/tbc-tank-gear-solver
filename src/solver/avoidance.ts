
const BASE_AVOIDANCE_TARGET = 102.4;
const ILLIDAN_SHEAR_AVOIDANCE_TARGET = 101.8;
export const calculateAvoidanceTarget = (
	uncrushabilitySetting: number,
	baseAvoidance: number
) => {
	if (uncrushabilitySetting === 0) return 0;
	const target =
		uncrushabilitySetting === 2
			? ILLIDAN_SHEAR_AVOIDANCE_TARGET
			: BASE_AVOIDANCE_TARGET;
	return target - baseAvoidance;
};

export const calculateUncritabilityTarget = (uncritabilitySetting: number, baseUncritability: number) => {
	if (uncritabilitySetting === 0) return 0;
	const CRIT_TARGET =
		uncritabilitySetting === 1 ? 5.4 : 5.6;
	return CRIT_TARGET - baseUncritability;	
};
