import { solveConfig, type SolveOptions } from "./solveConfig";
import type { InputItem } from "./types";

self.onmessage = async (e) => {
	const { items, options } = e.data as {
		items: InputItem[];
		options: SolveOptions;
	};

	const result = await solveConfig(items, options, (progress) =>
		postMessage({ type: "progress", ...progress }),
	);

	postMessage({ type: "result", items: result });
};
