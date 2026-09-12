// Verifies the things about the solver Worker that no unit test can reach, by driving the real
// app in a real browser: that the sim wasm is instantiated ONCE per session rather than once per
// solve, and that a second solve reuses the same Worker.
//
// This exists because the costs it guards are invisible to every other check in the repo. tsc,
// biome and vitest all pass whether the Worker is shared or rebuilt per solve; the difference
// only shows up as network traffic and wall-clock time in a browser. It is the same class of gap
// that once let a worker change pass every automated check and fail `vite build` outright.
//
// Usage:  npm run verify:solver-worker  [-- --headed] [--keep-open]
// Exit code is 0 only if every assertion passes, so this is CI-usable as-is.
//
// Needs a Playwright browser: `npx playwright install chromium`. Playwright pins a browser build
// per release, so bumping the playwright devDependency requires running that again - the failure
// mode is an explicit "Please run the following command to download new browsers" error, not a
// confusing one.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PORT = Number(process.env.VERIFY_PORT ?? 3101);
const ORIGIN = `http://localhost:${PORT}`;
const HEADED = process.argv.includes("--headed");
const KEEP_OPEN = process.argv.includes("--keep-open");

// How long a cold first solve may take. It is dominated by deriveLinearModel's ~25 computeStats
// probes, not by the LP, and a debug-build wasm under a headless browser is far slower than a
// user's machine - hence minutes, not seconds.
const FIRST_SOLVE_TIMEOUT_MS = 10 * 60 * 1000;
const SECOND_SOLVE_TIMEOUT_MS = 5 * 60 * 1000;
const WARM_TIMEOUT_MS = 5 * 60 * 1000;

// A deliberately small pool: enough slots that the LP makes real choices, few enough that the
// solve is dominated by the fixed sim costs this script is actually measuring. Mirrors
// src/solver/__fixtures__/testItemPool.ts, which is Paladin-legal by construction.
const ITEM_IDS = [
	34400, 30007, 28743, 29925, 34394, 28502, 34352, 34488, 32263, 32267, 30021,
	32325, 29323, 30083, 32501, 33830,
];

// Seeded directly into localStorage rather than clicked together through the UI: this script is
// about Worker lifetime, so the config has to be a fixed, valid input rather than something that
// breaks whenever the configuration panel is restyled. `optimizeStats` must be non-empty or
// assertObjectiveIsWeighted rejects the solve (see solveEHP.ts).
const SEEDED_STATE = {
	version: 2,
	itemInput: JSON.stringify({
		items: ITEM_IDS.map((id) => ({ id, gems: [] })),
	}),
	classValue: "2",
	areEnchantsGemsLocked: false,
	excludeUniqueGems: false,
	excludeJewelcraftingItems: false,
	excludeEnchantingItems: false,
	independentConfigs: false,
	phase: 3,
	configs: [
		{
			id: "default",
			name: "Default Config",
			uncritabilitySetting: 2,
			uncrushabilitySetting: 1,
			optimizeStats: [{ name: "Stamina", value: 1 }],
			objectiveMode: "stats",
			balance: 0.5,
			survivabilityMetric: "tmi",
			enabledCalibrationStats: [],
			resistanceFloors: [],
			enabledConsumableIds: [],
		},
	],
	activeConfigId: "default",
	solveResults: [],
	activeResultId: null,
};

const failures = [];
const notes = [];
function check(ok, label, detail) {
	console.log(
		`${ok ? "  PASS" : "  FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
	);
	if (!ok) failures.push(label);
}

async function startDevServer() {
	// Invoked through node against vite's own bin rather than through npx: npx needs a shell on
	// Windows (spawn EINVAL otherwise), and a shell would leave the server orphaned when this
	// script kills its child.
	const viteBin = fileURLToPath(
		new URL("../../node_modules/vite/bin/vite.js", import.meta.url),
	);
	const server = spawn(
		process.execPath,
		[viteBin, "dev", "--port", String(PORT), "--strictPort"],
		{ stdio: ["ignore", "pipe", "pipe"] },
	);
	server.stdout.on("data", () => {});
	server.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(ORIGIN, { method: "GET" });
			if (res.ok) return server;
		} catch {
			/* not up yet */
		}
		await sleep(500);
	}
	server.kill();
	throw new Error(`dev server did not come up on ${ORIGIN}`);
}

/**
 * The results panel is a clean state machine (see ResultsPanel/index.tsx): loading, then either
 * the error placeholder or the results themselves. Waiting on that, rather than on a console
 * line, is what makes this repeatable - and it is the only way to see a Worker-side failure at
 * all, since Playwright does not surface Web Worker console output to the page.
 */
async function waitForSolve(page, label, timeoutMs) {
	const started = Date.now();
	const deadline = started + timeoutMs;
	let lastProgress = "";
	while (Date.now() < deadline) {
		if (await page.getByText("Solve failed").count()) {
			const message = await page
				.locator("body")
				.innerText()
				.then((t) => t.split("Solve failed")[1]?.trim().slice(0, 200) ?? "");
			console.log(`  ${label}: FAILED in-app — ${message}`);
			return { ok: false, seconds: (Date.now() - started) / 1000, message };
		}
		if (await page.getByText("Include buffs & consumables").count()) {
			return { ok: true, seconds: (Date.now() - started) / 1000 };
		}
		const progress = await page
			.locator("body")
			.innerText()
			.then((t) => t.match(/\b\d{1,3}%/)?.[0] ?? "")
			.catch(() => "");
		if (progress && progress !== lastProgress) {
			lastProgress = progress;
			console.log(
				`  ${label}: ${progress} (t+${((Date.now() - started) / 1000).toFixed(0)}s)`,
			);
		}
		await sleep(2000);
	}
	return {
		ok: false,
		seconds: (Date.now() - started) / 1000,
		message: "timed out",
	};
}

async function clickSolve(page) {
	const button = page.getByRole("button", { name: /^Solve all/ }).first();
	await button.waitFor({ state: "visible", timeout: 30_000 });
	await button.click({ force: true });
}

const server = await startDevServer();
const browser = await chromium.launch({ headless: !HEADED });
let exitCode = 0;

try {
	const page = await browser.newPage();

	const wasmResponses = [];
	const dbResponses = [];
	// The Response objects themselves, so the warm can be awaited properly rather than slept on.
	const wasmBodies = [];
	page.on("response", (r) => {
		const url = r.url();
		if (url.includes("lib.wasm.gz")) {
			wasmResponses.push(r.status());
			wasmBodies.push(r.finished());
		}
		if (url.includes("/sim/db.json")) dbResponses.push(r.status());
	});

	const solverWorkerUrls = [];
	const poolWorkerUrls = [];
	page.on("worker", (w) => {
		if (w.url().includes("solver.worker")) solverWorkerUrls.push(w.url());
		if (w.url().includes("simExecutor.worker")) poolWorkerUrls.push(w.url());
	});
	page.on("pageerror", (e) => notes.push(`pageerror: ${e.message}`));

	await page.addInitScript(
		(state) => localStorage.setItem("appState", JSON.stringify(state)),
		SEEDED_STATE,
	);

	console.log(`\nLoading ${ORIGIN} ...`);
	await page.goto(ORIGIN, { waitUntil: "load" });

	// --- the warm -----------------------------------------------------------------------
	console.log("\nWaiting for the mount-time warm to fetch the wasm ...");
	const warmDeadline = Date.now() + WARM_TIMEOUT_MS;
	while (wasmResponses.length === 0 && Date.now() < warmDeadline)
		await sleep(1000);
	check(
		wasmResponses.length > 0,
		"warm fetches the sim wasm without any user action",
		`${wasmResponses.length} response(s)`,
	);
	// Wait for the warm to actually finish before solving, rather than sleeping a fixed guess.
	//
	// A blind sleep here made this harness flaky: on a cold machine (a freshly-downloaded browser,
	// say) 37MB of wasm can still be instantiating when the sleep expires, so solve #1 races the
	// warm. If that race errors, the Worker is recycled by design - and the run then reports two
	// Workers and three db.json fetches, which looks exactly like the regression this harness
	// exists to catch. A false positive here is worse than no check at all, because it teaches
	// people to ignore the output.
	//
	// So: await the response body completing, then settle. The settle is still a sleep, because
	// go.run()'s completion is not observable from outside the Worker - but it now starts from a
	// known point instead of from "roughly when the headers arrived".
	await Promise.all(wasmBodies).catch(() => {});
	await sleep(20_000);
	const afterWarm = { wasm: wasmResponses.length, db: dbResponses.length };

	// --- solve #1 -----------------------------------------------------------------------
	console.log("\nSolve #1 (cold caches inside the Worker) ...");
	await clickSolve(page);
	const first = await waitForSolve(page, "solve #1", FIRST_SOLVE_TIMEOUT_MS);
	check(
		first.ok,
		"a real solve completes end to end",
		`${first.seconds.toFixed(1)}s`,
	);

	const afterFirst = { wasm: wasmResponses.length, db: dbResponses.length };

	// --- solve #2 -----------------------------------------------------------------------
	let second = { ok: false, seconds: 0 };
	if (first.ok) {
		console.log("\nSolve #2 (same Worker, warm caches) ...");
		await clickSolve(page);
		second = await waitForSolve(page, "solve #2", SECOND_SOLVE_TIMEOUT_MS);
		check(
			second.ok,
			"a second solve completes",
			`${second.seconds.toFixed(1)}s`,
		);
	}

	// --- the assertions this script exists for ------------------------------------------
	//
	// Phase-scoped rather than bare totals, because not every lib.wasm.gz fetch would be the
	// coordinator in every scenario: the iteration-bound sim pool (simExecutor.worker.ts) is a
	// deliberately separate set of Go instances, so a tps/dtps/tmi solve legitimately loads wasm
	// of its own. This scenario is a "stats" solve, which runs its one display sim on the
	// coordinator and spawns no pool workers - so here the correct total really is one, and any
	// fetch after the warm means an instance was built that should not have been.
	//
	// That is not hypothetical. This check first ran with two fetches, which turned out to be
	// statWeightsClient.ts still carrying a verbatim copy of wasmCoordinator's loader - two 37MB
	// Go instances in one Worker realm, clobbering each other's globals.
	console.log("");
	console.log("Worker lifetime:");
	check(
		afterWarm.wasm === 1,
		"the warm loads the coordinator wasm exactly once, before any solve",
		`${afterWarm.wasm} fetch(es) by the end of the warm`,
	);
	check(
		afterWarm.db === 2,
		"db.json is fetched twice - once on the main thread, once in the Worker",
		`${afterWarm.db} fetch(es)`,
	);
	check(
		solverWorkerUrls.length === 1,
		"exactly one solver Worker is created for the whole session",
		`${solverWorkerUrls.length} created`,
	);
	check(
		wasmResponses.length === 1 && poolWorkerUrls.length === 0,
		"a stats-mode session builds exactly ONE Go instance, total",
		`${wasmResponses.length} wasm fetch(es), ${poolWorkerUrls.length} pool worker(s)`,
	);
	if (second.ok) {
		check(
			wasmResponses.length === afterFirst.wasm,
			"a second solve loads no wasm at all - nothing was thrown away",
			`${afterFirst.wasm} before, ${wasmResponses.length} after`,
		);
		check(
			dbResponses.length === afterFirst.db,
			"a second solve refetches no database",
			`${afterFirst.db} before, ${dbResponses.length} after`,
		);
	}
	notes.push(
		`wasm fetches by phase: warm ${afterWarm.wasm}, during solve #1 ` +
			`${afterFirst.wasm - afterWarm.wasm} (the sim pool: ${poolWorkerUrls.length} executor ` +
			`worker(s)), during solve #2 ${wasmResponses.length - afterFirst.wasm}`,
	);
	if (first.ok && second.ok) {
		notes.push(
			`solve #1 ${first.seconds.toFixed(1)}s, solve #2 ${second.seconds.toFixed(1)}s`,
		);
	}
	if (KEEP_OPEN) {
		console.log("\n--keep-open: leaving the browser up. Ctrl-C to finish.");
		await sleep(10 * 60 * 1000);
	}
} catch (error) {
	console.error("\nharness error:", error);
	failures.push(`harness error: ${error.message}`);
} finally {
	await browser.close();
	server.kill();
}

console.log("");
for (const note of notes) console.log(`note: ${note}`);
if (failures.length) {
	console.log(`\nFAILED (${failures.length}):`);
	for (const f of failures) console.log(`  - ${f}`);
	exitCode = 1;
} else {
	console.log("\nAll solver-Worker checks passed.");
}
process.exit(exitCode);
