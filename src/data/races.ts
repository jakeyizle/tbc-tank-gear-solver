// Only Paladin-eligible races - this app is Prot Paladin-specific.
export const RACE_LABELS: Record<string, string> = {
	"1": "Human",
	"3": "Dwarf",
	"10": "Blood Elf",
	"11": "Draenei",
};

// Maps a WowSims export's "race" field (e.g. "Human") to our numeric race id.
// Keyed by lowercased, space-stripped name so casing/spacing variants both match.
export const RACE_NAME_TO_ID: Record<string, string> = {
	human: "1",
	dwarf: "3",
	bloodelf: "10",
	draenei: "11",
};
