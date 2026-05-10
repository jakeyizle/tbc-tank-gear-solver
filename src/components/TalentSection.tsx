import { getTalentsByClass } from "#/data/talents";

interface TalentSectionProps {
    classId: string;
}

export const TalentSection = ({ classId }: TalentSectionProps) => {
    const talents = getTalentsByClass(classId);
    return (
        <>
            {talents.map((talent) => (
                <div key={talent.id}>
                    <h3>{talent.name}</h3>
                </div>
            ))}
        </>
    );
};