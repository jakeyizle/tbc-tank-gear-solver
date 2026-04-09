
import GLPK, {type GLPK as GLPKType, type LP } from "glpk.js";
import type { LPItem, ProcessedItemType } from "./types";

function typeBoundNumber(type: ProcessedItemType) {
    return type === "Finger" || type === "Trinket" ? 2 : 1;
}

const groupItemsByType = (items: LPItem[]) => {
    return items.reduce(
        (acc, item) => {
            acc[item.type] = [...(acc[item.type] ?? []), item];
            return acc;
        },
        {} as Record<ProcessedItemType, LPItem[]>,
    );
};

const groupItemsByItemId = (items: LPItem[]) => {
    return items.reduce(
        (acc, item) => {
            if (!acc[item.id]) acc[item.id] = [];
            acc[item.id].push(item);
            return acc;
        },
        {} as Record<string, LPItem[]>,
    );
};

interface Objective {
    direction: number;
    name: string;
    vars: { name: string; coef: number }[];
}

interface SubjectTo {
    name: string;
    vars: { name: string; coef: number }[];
    bnds: { type: number; ub: number; lb: number };
}

const createModel = (
    objective: Objective,
    subjectTo: SubjectTo[],
    lpItems: LPItem[],
): LP => {
    return {
        name: "wow-gear",
        objective,
        subjectTo,
        binaries: lpItems.map((item) => item.uniqueId),
    };
};

const makeAvoidanceConstraint = (
    lpItems: LPItem[],
    avoidanceTarget: number,
    glpk: GLPKType,
) => {
    return {
        name: "avoidance",
        vars: lpItems.map((item) => ({
            name: item.uniqueId,
            coef: item.avoidanceScore,
        })),
        bnds: {
            type: glpk.GLP_LO,
            lb: avoidanceTarget,
            ub: Number.POSITIVE_INFINITY,
        },
    };
};

const makeUncritableConstraint = (
    lpItems: LPItem[],
    uncritabilityTarget: number,
    glpk: GLPKType,
) => {
    return {
        name: "uncritable",
        vars: lpItems.map((item) => ({
            name: item.uniqueId,
            coef: item.uncritabilityScore,
        })),
        bnds: {
            type: glpk.GLP_LO,
            lb: uncritabilityTarget,
            ub: Number.POSITIVE_INFINITY,
        },
    }
}

// each slot can have 1 (or 2 for finger/trinket) items
const makeSlotConstraint = (
    itemsByType: Record<ProcessedItemType, LPItem[]>,
    glpk: GLPKType,
) => {
    return Object.entries(itemsByType).map(([type, items]) => ({
        name: `type_${type}`,
        vars: items.map((item) => ({
            name: item.uniqueId,
            coef: 1,
        })),
        // TODO: fix type cast
        bnds: {
            type: glpk.GLP_FX,
            lb: typeBoundNumber(type as ProcessedItemType),
            ub: typeBoundNumber(type as ProcessedItemType),
        },
    }));
};

// each item base can only be used once - otherwise multiple rings will be used
const makeBaseItemConstaint = (
    itemsByItemId: Record<string, LPItem[]>,
    glpk: GLPKType,
) => {
    return Object.entries(itemsByItemId).map(([id, items]) => ({
        name: `unique_${id}`,
        vars: items.map((item) => ({
            name: item.uniqueId,
            coef: 1,
        })),
        bnds: { type: glpk.GLP_UP, ub: 1, lb: 0 },
    }));
};

const solveOptions = (glpk: GLPKType) => ({
    msglev: glpk.GLP_MSG_ON,
    mipgap: 0.0,
});

const runLPModel = async (lpItems: LPItem[], avoidanceTarget: number, uncritabilityTarget: number) => {
    const glpk = await GLPK();
    const itemsByType = groupItemsByType(lpItems);
    const itemsByItemId = groupItemsByItemId(lpItems);

    const objective = {
        direction: glpk.GLP_MAX,
        name: "obj",
        vars: lpItems.map((item) => ({
            name: item.uniqueId,
            coef: item.objectiveScore,
        })),
    };
    
    const slotConstraint = makeSlotConstraint(itemsByType, glpk);
    const baseItemConstraint = makeBaseItemConstaint(itemsByItemId, glpk);
    
    const constraints: SubjectTo[] = [...slotConstraint, ...baseItemConstraint];
    
    if (avoidanceTarget > 0) {
        const avoidanceConstaint = makeAvoidanceConstraint(lpItems, avoidanceTarget, glpk);
        constraints.push(avoidanceConstaint);
    }
    
    if (uncritabilityTarget > 0) {
        const uncritableConstraint = makeUncritableConstraint(lpItems, uncritabilityTarget, glpk);
        constraints.push(uncritableConstraint);
    }

    const avoidanceModel = createModel(objective, constraints, lpItems);

    let result = await glpk.solve(avoidanceModel, solveOptions(glpk));
    if (result.result.status !== glpk.GLP_OPT) {
        console.error(
            "GLPK failed to find an optimal solution, trying to find best result...",
        );

        const avoidanceObjective = {
            direction: glpk.GLP_MAX,
            name: "obj",
            vars: lpItems.map((item) => ({
                name: item.uniqueId,
                coef: item.avoidanceScore,
            })),
        };
        const bestAvoidanceTryModel = createModel(
            avoidanceObjective,
            [...slotConstraint, ...baseItemConstraint],
            lpItems,
        );
        result = await glpk.solve(bestAvoidanceTryModel, solveOptions(glpk));
    }

    const chosenItems = Object.entries(result.result.vars)
        .filter(([_, value]) => value === 1)
        .map(([uniqueId]) => lpItems.find((item) => item.uniqueId === uniqueId))
        .filter((item) => !!item);

    return chosenItems;
};

self.onmessage = async (e) => {
    console.log('worker started');
    console.log(e.data);
    const {lpItems, avoidanceTarget, uncritabilityTarget} = e.data;

  const result = await runLPModel(lpItems, avoidanceTarget, uncritabilityTarget);

  postMessage(result);
};
