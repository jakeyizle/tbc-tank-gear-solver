
const BASE_AVOIDANCE_TARGET = 102.4;
export const calculateAvoidanceTarget = (	
	uncrushabilitySetting: number,
	baseAvoidance: number
) => {
	if (uncrushabilitySetting === 0) return 0;	
	return BASE_AVOIDANCE_TARGET - baseAvoidance;
};

// TODO: make configurable (should be either 5.6 or 5.4, but incorporate talents etc)
export const calculateUncritabilityTarget = (uncritabilitySetting: number, baseUncritability: number) => {
	if (uncritabilitySetting === 0) return 0;
	let CRIT_TARGET =
		uncritabilitySetting === 1 ? 5.4 : 5.6;
	CRIT_TARGET -= baseUncritability;
	return CRIT_TARGET;
};
