import { createContext, type ReactNode, useState } from "react";

interface CharacterConfigValue {
	classId: string;
	raceId: string;
}

interface CharacterConfigContextType {
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
