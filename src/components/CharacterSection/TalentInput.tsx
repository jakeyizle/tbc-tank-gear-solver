import type { ModifierSource } from "#/solver/types";
import NumberSpinner from "../input/NumberSpinner";

interface TalentInputProps {
    talent: ModifierSource
    talentRank: number
    onChange: (newRank: number) => void
}

export default function TalentInput({talent, talentRank, onChange}: TalentInputProps) {
    return (
        <NumberSpinner
            id={talent.id}
            label={talent.name}
            value={talentRank}
            min={0}
            max={talent.maxRank}
            size="small"
            onValueChange={(e) => onChange(Number(e))} />
    )
}