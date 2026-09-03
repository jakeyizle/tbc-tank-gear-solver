export const CLASS_LABELS: Record<string, string> = {
	// "1": "Warrior",
	"2": "Paladin",
	// "11": "Druid",
};

// Maps a WowSims export's "class" field (e.g. "paladin" or "Paladin" - casing is
// inconsistent between export variants) to our numeric class id. Keyed by
// lowercased, space-stripped name to match either casing.
export const CLASS_NAME_TO_ID: Record<string, string> = {
	paladin: "2",
};
