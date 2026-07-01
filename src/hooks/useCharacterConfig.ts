import { useContext } from "react";
import { CharacterConfigContext } from "#/contexts/CharacterConfigContext";

export function useCharacterConfig() {
	const context = useContext(CharacterConfigContext);

	if (!context) {
		throw new Error("useCharacterConfig must be used within CharacterConfigProvider");
	}

	return context;
}
