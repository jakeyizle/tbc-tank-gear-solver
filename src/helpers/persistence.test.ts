import { beforeEach, describe, expect, it } from "vitest";
import { loadAppState, saveAppState } from "./persistence";

function installLocalStorageMock() {
	const store = new Map<string, string>();
	const mock = {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => {
			store.set(key, value);
		},
		removeItem: (key: string) => {
			store.delete(key);
		},
		clear: () => store.clear(),
	};
	Object.defineProperty(globalThis, "localStorage", {
		value: mock,
		configurable: true,
		writable: true,
	});
	return store;
}

const baseState = {
	itemInput: "30125\n30007",
	classValue: "2",
	raceValue: "1",
	talents: [],
	areEnchantsGemsLocked: false,
	excludeUniqueGems: false,
	phase: 5,
	configs: [],
	activeConfigId: "a",
	solveResults: [],
	activeResultId: null,
} as unknown as Parameters<typeof saveAppState>[0];

describe("persistence", () => {
	let store: Map<string, string>;
	beforeEach(() => {
		store = installLocalStorageMock();
	});

	it("round-trips a saved state at the current version", () => {
		saveAppState(baseState);
		expect(loadAppState()).toMatchObject({
			itemInput: "30125\n30007",
			phase: 5,
			activeConfigId: "a",
		});
	});

	it("returns null when nothing is stored", () => {
		expect(loadAppState()).toBeNull();
	});

	it("still reads the pre-versioning standalone itemInput key", () => {
		store.set("itemInput", "12345");
		expect(loadAppState()).toEqual({ itemInput: "12345" });
	});

	// The gear pool is the only persisted field a user cannot trivially recreate, so every
	// unreadable-state path below must still hand it back rather than returning null. Before
	// the migration framework, a version mismatch discarded it outright.
	it("salvages the gear pool from a blob written by a NEWER build", () => {
		store.set(
			"appState",
			JSON.stringify({ ...baseState, version: 999, phase: 3 }),
		);
		expect(loadAppState()).toEqual({ itemInput: "30125\n30007" });
	});

	it("salvages the gear pool when no migration path exists from an older version", () => {
		store.set("appState", JSON.stringify({ ...baseState, version: 0 }));
		expect(loadAppState()).toEqual({ itemInput: "30125\n30007" });
	});

	// The real v1 shape, as written by the build before the sim-as-source-of-truth refactor:
	// per-config `abilities`/`talents`/`buffs`, a top-level `talents`, and slug-keyed
	// `enabledConsumableIds`. None of that can be read as a v2 config, and there is deliberately
	// no migration (see CURRENT_VERSION's comment) - so this must salvage rather than load a
	// half-converted shape the UI would then crash on.
	it("salvages the gear pool from a real v1 blob", () => {
		store.set(
			"appState",
			JSON.stringify({
				version: 1,
				itemInput: "30125\n30007",
				classValue: "2",
				raceValue: "1",
				talents: [{ id: "toughness", rank: 5 }],
				areEnchantsGemsLocked: false,
				excludeUniqueGems: false,
				independentConfigs: false,
				phase: 5,
				configs: [
					{
						id: "a",
						name: "A",
						uncritabilitySetting: 2,
						uncrushabilitySetting: 1,
						optimizeStats: [],
						objectiveMode: "stats",
						resistanceFloors: [],
						abilities: [],
						talents: [],
						buffs: [{ id: "blessing-of-kings", checked: true }],
						enabledConsumableIds: ["flask-of-fortification"],
					},
				],
				activeConfigId: "a",
				solveResults: [],
				activeResultId: null,
			}),
		);
		expect(loadAppState()).toEqual({ itemInput: "30125\n30007" });
	});

	it("returns null for corrupt JSON", () => {
		store.set("appState", "{not json");
		expect(loadAppState()).toBeNull();
	});

	it("salvages nothing when the blob has no usable gear pool", () => {
		store.set("appState", JSON.stringify({ version: 999, itemInput: "" }));
		expect(loadAppState()).toBeNull();
	});
});
