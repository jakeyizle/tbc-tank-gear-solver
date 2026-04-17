import { useContext } from "react";
import { SolveConfigContext } from "#/contexts/SolveConfigContext";

export function useSolveConfig() {
	const context = useContext(SolveConfigContext);

	if (!context) {
		throw new Error("useSolveConfig must be used within SolveConfigProvider");
	}

	return context;
}
