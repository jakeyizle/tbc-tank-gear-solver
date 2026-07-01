import { createContext, type ReactNode, useState } from "react";
import type { ModifierSource } from "#/solver/types";

export interface CharacterConfigValue {
	classId: string;
	raceId: string;
	talentSources: ModifierSource[];
	abilitySources: ModifierSource[];
}

export interface CharacterConfigContextType {
	characterConfig: CharacterConfigValue | null;
	updateCharacterConfig: (config: CharacterConfigValue) => void;
}

export const CharacterConfigContext = createContext<CharacterConfigContextType | null>(
	null,
);

interface CharacterConfigProviderProps {
	children: ReactNode;
}

export function CharacterConfigProvider({ children }: CharacterConfigProviderProps) {
	const [characterConfig, setCharacterConfig] = useState<CharacterConfigValue | null>(
		null,
	);

	const updateCharacterConfig = (config: CharacterConfigValue) => {
		setCharacterConfig(config);
	};

	return (
		<CharacterConfigContext.Provider value={{ characterConfig, updateCharacterConfig }}>
			{children}
		</CharacterConfigContext.Provider>
	);
}
