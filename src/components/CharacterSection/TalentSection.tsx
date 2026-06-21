import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Grid from "@mui/material/Grid";
import type { ModifierSource } from "#/solver/types";
import TalentInput from "./TalentInput";

interface TalentSectionProps {
    talents: ModifierSource[];
    setTalents: (value: ModifierSource[]) => void;
}

export const TalentSection = ({ talents, setTalents }: TalentSectionProps) => {

    const updateTalentRank = (talentId: string, newRank: number) => {
        const updatedTalents = talents.map((talent) => {
            if (talent.id === talentId) {
                return { ...talent, rank: newRank };
            }
            return talent;
        });
        setTalents(updatedTalents);
    }
    return (
        <FormControl>
        
			<FormLabel id="class-select-label">Talents</FormLabel>
            <Grid container spacing={1}>
            {talents.map((talent) => (
                <TalentInput
                    key={talent.id}
                    talent={talent}
                    talentRank={talent.rank || 0}
                    onChange={(newRank) => updateTalentRank(talent.id, newRank)}
                />
            ))}
            </Grid>
        </FormControl>
    );
};