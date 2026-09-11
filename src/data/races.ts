import type { SimRace } from "#/types/SimCalibrationProfile";

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

// This app's race ids are NOT the proto Race enum's numbering, and the two overlap misleadingly:
// app "1" is Human but proto Race 1 is BloodElf, and only Dwarf happens to coincide at 3. So
// these mappings are required - never cast or Number() between the two id spaces.
//
// (classId is the opposite case: the app's class ids ARE the proto Class enum's values, which is
// why prepareItemCandidates can compare an item's classAllowlist against config.classId directly.)
export const SIM_RACE_BY_ID: Record<string, SimRace> = {
	"1": "RaceHuman",
	"3": "RaceDwarf",
	"10": "RaceBloodElf",
	"11": "RaceDraenei",
};

export const ID_BY_SIM_RACE: Record<SimRace, string> = {
	RaceHuman: "1",
	RaceDwarf: "3",
	RaceBloodElf: "10",
	RaceDraenei: "11",
};
