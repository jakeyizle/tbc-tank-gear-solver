// Shared by simExecutor.worker.ts and statWeightsClient.ts: lib.wasm is shipped gzipped
// (see scripts/sim/buildWasm.mjs - the raw binary is ~37MB, over Cloudflare Workers assets'
// 25MiB per-file deploy limit).
//
// Whether the fetched bytes are still gzip-compressed on arrival is server-dependent, not
// something this code can assume: some static servers (e.g. Vite's dev/preview server, via
// sirv) recognize the ".gz" suffix and transparently decompress with a Content-Encoding
// header before the body reaches fetch(), while others (expected from Cloudflare's asset
// server, since the deploy-size check that forced this gzipping in the first place runs
// against the raw uploaded file) serve the gzip bytes as-is. So this checks the actual magic
// number rather than assuming either way.
const GZIP_MAGIC = [0x1f, 0x8b];

export async function fetchWasmModule(
	url: string,
	importObject: WebAssembly.Imports,
): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
	const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
	const isGzipped = bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
	if (!isGzipped) return WebAssembly.instantiate(bytes, importObject);

	const body = new Response(bytes).body;
	if (!body) throw new Error("fetchWasmModule: response has no body to decompress");
	const decompressed = await new Response(
		body.pipeThrough(new DecompressionStream("gzip")),
	).arrayBuffer();
	return WebAssembly.instantiate(new Uint8Array(decompressed), importObject);
}
