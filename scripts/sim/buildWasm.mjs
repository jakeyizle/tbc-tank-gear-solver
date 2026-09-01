// Builds the tbc-new sim as a WASM module and stages it (plus a matching wasm_exec.js
// runtime shim) for the app to fetch lazily at runtime. Requires a local Go toolchain
// (see vendor/tbc-sim/go.mod for the pinned version) and, on first run, `protoc-gen-go`
// (installed automatically below via `go install` if missing).
//
// Mirrors vendor/tbc-sim/makefile's `wasm` and `sim/core/proto/api.pb.go` targets, run
// against the vendored submodule rather than a standalone tbc-new checkout.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const simRoot = path.join(root, "vendor/tbc-sim");
const publicSimDir = path.join(root, "public/sim");

function run(cmd, args, opts = {}) {
	console.log(`$ ${cmd} ${args.join(" ")}`);
	execFileSync(cmd, args, { stdio: "inherit", cwd: simRoot, shell: process.platform === "win32", ...opts });
}

function goEnv(name) {
	return execFileSync("go", ["env", name], { cwd: simRoot }).toString().trim();
}

// 1. Ensure protoc-gen-go is available (one-time; cached in GOPATH/bin by `go install`).
const gopath = goEnv("GOPATH");
const protocGenGo = path.join(gopath, "bin", process.platform === "win32" ? "protoc-gen-go.exe" : "protoc-gen-go");
if (!fs.existsSync(protocGenGo)) {
	run("go", ["install", "google.golang.org/protobuf/cmd/protoc-gen-go@latest"]);
}
const pathWithGoBin = `${path.join(gopath, "bin")}${path.delimiter}${process.env.PATH}`;

// 2. Regenerate the Go proto bindings (sim/core/proto/*.pb.go) from vendor/tbc-sim/proto/*.proto.
const protocBin = path.join(root, "node_modules/.bin/protoc" + (process.platform === "win32" ? ".cmd" : ""));
run(
	protocBin,
	[
		"-I=./proto",
		"--go_opt=Mgoogle/protobuf/descriptor.proto=google.golang.org/protobuf/types/descriptorpb",
		"--go_out=./sim/core",
		...fs.readdirSync(path.join(simRoot, "proto")).filter((f) => f.endsWith(".proto")).map((f) => `./proto/${f}`),
	],
	{ env: { ...process.env, PATH: pathWithGoBin } },
);

// 3. Build the WASM binary.
fs.mkdirSync(publicSimDir, { recursive: true });
const wasmOut = path.join(publicSimDir, "lib.wasm");
run("go", ["build", "-o", wasmOut, "./sim/wasm/"], { env: { ...process.env, GOOS: "js", GOARCH: "wasm" } });

// 4. Vendor the matching wasm_exec.js runtime shim (coupled to the Go version that built
// the binary above — regenerated here rather than committed once, so it can't drift).
const goRoot = goEnv("GOROOT");
const candidates = [path.join(goRoot, "lib", "wasm", "wasm_exec.js"), path.join(goRoot, "misc", "wasm", "wasm_exec.js")];
const wasmExecSrc = candidates.find((p) => fs.existsSync(p));
if (!wasmExecSrc) throw new Error(`wasm_exec.js not found. Tried: ${candidates.join(", ")}`);
fs.copyFileSync(wasmExecSrc, path.join(root, "src/sim/wasm_exec.js"));

const { size } = fs.statSync(wasmOut);
console.log(`Built ${path.relative(root, wasmOut)} (${(size / 1024 / 1024).toFixed(1)} MB) and refreshed src/sim/wasm_exec.js`);

// 5. Stage the item/gem/enchant database alongside lib.wasm, for the same lazy fetch("/sim/...")
// treatment - see src/sim/simDatabaseClient.ts. Copied as-is (not trimmed) for v1.
const dbSrc = path.join(simRoot, "assets/database/db.json");
const dbOut = path.join(publicSimDir, "db.json");
fs.copyFileSync(dbSrc, dbOut);
console.log(`Copied ${path.relative(root, dbSrc)} -> ${path.relative(root, dbOut)} (${(fs.statSync(dbOut).size / 1024 / 1024).toFixed(1)} MB)`);
