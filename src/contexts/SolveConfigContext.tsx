import { createContext, type ReactNode, useState } from "react";

export interface SolveConfigContextValue {
	classId: string;
	raceId: string;
}

export interface SolveConfigContextType {
	solveConfig: SolveConfigContextValue | null;
	updateSolveConfig: (config: SolveConfigContextValue) => void;
}

export const SolveConfigContext = createContext<SolveConfigContextType | null>(
	null,
);

interface SolveConfigProviderProps {
	children: ReactNode;
}

export function SolveConfigProvider({ children }: SolveConfigProviderProps) {
	const [solveConfig, setSolveConfig] = useState<SolveConfigContextValue | null>(
		null,
	);

	const updateSolveConfig = (config: SolveConfigContextValue) => {
		setSolveConfig(config);
	};

	return (
		<SolveConfigContext.Provider value={{ solveConfig, updateSolveConfig }}>
			{children}
		</SolveConfigContext.Provider>
	);
}
