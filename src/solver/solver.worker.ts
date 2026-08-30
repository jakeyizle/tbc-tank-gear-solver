import { solveConfig, type SolveOptions } from "./solveConfig";
import type { InputItem } from "./types";

self.onmessage = async (e) => {
	const { items, options } = e.data as {
		items: InputItem[];
		options: SolveOptions;
	};

	try {
		const result = await solveConfig(items, options, (progress) =>
			postMessage({ type: "progress", ...progress }),
		);
		postMessage({ type: "result", items: result });
	} catch (error) {
		postMessage({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
