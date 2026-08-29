import Enchants from "../data/enchants.json";
import Gems from "../data/gems.json";
import Items from "../data/items.json";
import { overrideItem } from "./itemOverride";
import type { SolverConfiguration } from "./SolverConfiguration";
import { gemsSatisfySocketBonus } from "./socketBonus";
import type {
	DecomposableItem,
	Enchant,
	EnchantCandidate,
	Gem,
	GemCandidate,
	InputItem,
	Item,
	ItemVariation,
	LPItem,
	ProcessedItemType,
	SocketCandidates,
	StatName,
} from "./types";

const createEmptyEnchant = (): Enchant => {
	return {
		name: "",
		id: "",
		effectID: "",
		type: "Ranged",
		stats: [],
	};
};

// Partitions input items into two groups for the MIP model:
// - fixedItems: locked items (already have chosen gems/enchant) and consumables - fully
//   scored single-variant LPItems, unchanged from the pre-decomposition approach
// - decomposableItems: unlocked items broken into first-class (item, enchant) and
//   (item, socket, gem) candidates, scored individually, for the solver to combine
export const prepareItemCandidates = (
	inputItems: InputItem[],
	config: SolverConfiguration,
): { fixedItems: LPItem[]; decomposableItems: DecomposableItem[] } => {
	const items = inputItems
		.map((item) => getItem(item))
		.filter((item): item is ItemVariation => !!item);

	const enchants = getEnchants(config);
	const gems = getGems(config);
	const filteredGems = gems.filter((gem) => gem.color !== "Meta");
	const metaGems = gems.filter((gem) => gem.color === "Meta");

	const enchantScoreCache = new Map<string, ReturnType<SolverConfiguration["calculateScoresForStats"]>>();
	const getEnchantScores = (enchant: Enchant) => {
		let scores = enchantScoreCache.get(enchant.id);
		if (!scores) {
			scores = config.calculateScoresForStats(enchant.stats);
			enchantScoreCache.set(enchant.id, scores);
		}
		return scores;
	};

	const gemScoreCache = new Map<string, ReturnType<SolverConfiguration["calculateScoresForStats"]>>();
	const getGemScores = (gem: Gem) => {
		let scores = gemScoreCache.get(gem.id);
		if (!scores) {
			scores = config.calculateScoresForStats(gem.stats);
			gemScoreCache.set(gem.id, scores);
		}
		return scores;
	};

	const fixedItems: LPItem[] = [];
	const decomposableItems: DecomposableItem[] = [];

	items.forEach((item, inputIndex) => {
		// key uniqueId off the input row's position, not the base item id, so two different
		// input rows that happen to offer the same base item (e.g. a ring in both Finger
		// candidate slots) never collide on the same LP variable name
		const uniqueId = `${item.id}-${inputIndex}`;

		// "locking" enchants and gems means that if an item already has an enchant or any
		// gems we will not create any new variations - score it directly, same as before
		if (item.locked && (item.gems.length > 0 || item.enchant.effectID !== "")) {
			fixedItems.push(transformItem({ ...item, uniqueId }, config));
			return;
		}

		const itemEnchants = getEnchantsForItem(item, enchants);
		const enchantCandidates: EnchantCandidate[] = itemEnchants.map((enchant) => ({
			enchant,
			varName: `e_${uniqueId}_${enchant.id}`,
			scores: getEnchantScores(enchant),
		}));

		const sockets: SocketCandidates[] = [];
		item.sockets.forEach((socket, socketIndex) => {
			const pool = socket.color === "Meta" ? metaGems : filteredGems;
			if (pool.length === 0) return;
			const candidates: GemCandidate[] = pool.map((gem) => ({
				gem,
				varName: `g_${uniqueId}_${socketIndex}_${gem.id}`,
				scores: getGemScores(gem),
			}));
			sockets.push({ socketIndex, color: socket.color, candidates });
		});

		const hasBonus =
			item.socketBonus.length > 0 &&
			sockets.some((socket) => socket.color !== "Meta");

		decomposableItems.push({
			base: item,
			uniqueId,
			processedType: getProcessedType(item),
			itemScores: config.calculateScoresForStats(item.stats),
			enchantCandidates,
			sockets,
			bonusVarName: hasBonus ? `b_${uniqueId}` : undefined,
			bonusScores: hasBonus ? config.calculateScoresForStats(item.socketBonus) : undefined,
		});
	});

	return { fixedItems, decomposableItems };
};

const getEnchants = (config: SolverConfiguration) => {
	let enchants = Enchants as Enchant[];
	enchants = enchants.filter((enchant) => enchant.stats.length > 0);
	enchants = enchants.filter((enchant) =>
		config.hasRelevantStats(enchant.stats),
	);
	return enchants;
};

const getGem = (id: string) => {
	const gemToReturn = Gems.find((g) => g.id === id);
	if (!gemToReturn) {
		console.error(`Gem not found: ${id}`);
		return undefined;
	}
	return gemToReturn;
};

const getEnchant = (idOrEffectID: string | undefined): Enchant | undefined => {
	let enchantToReturn = Enchants.find((e) => e.id === idOrEffectID);
	enchantToReturn ||= Enchants.find((e) => e.effectID === idOrEffectID);
	if (!enchantToReturn) {
		if (idOrEffectID) {
			console.error(`Enchant not found, id or effectID: ${idOrEffectID}`);
		}
		return createEmptyEnchant();
	}
	return enchantToReturn as Enchant;
};

const getGems = (config: SolverConfiguration) => {
	let gems = Gems as Gem[];
	gems = gems.filter((gem) => Number(gem.phase) <= config.phase);
	if (config.excludeUniqueGems) {
		gems = gems.filter((gem) => gem.isUnique !== "true");
	}
	gems = gems.filter((gem) => gem.stats.length > 0);
	gems = gems.filter((gem) => config.hasRelevantStats(gem.stats));
	return gems;
};

const getItem = (inputItem: InputItem) => {
	const items = Items as Item[];
	let baseItem = items.find((i) => i.id === inputItem.id);
	if (!baseItem) {
		console.error(`Item not found: ${inputItem.id}`);
		return undefined;
	}
	baseItem = overrideItem(baseItem);
	const gems = inputItem.gems
		.map((gem) => getGem(gem))
		.filter((gem) => !!gem) as Gem[];
	const enchant = getEnchant(inputItem.enchant);

	const item: ItemVariation = {
		...baseItem,
		gems,
		enchant: enchant as Enchant,
		uniqueId: `${inputItem.id}-0`,
		locked: !!inputItem.locked,
	};
	return item;
};

const getEnchantsForItem = (item: Item, enchants: Enchant[]) => {
	// weapon is ranged if type == ranged
	// however need to exclude wands, relics
	if (item.type === "Ranged") {
		if (["Bow", "Gun", "Crossbow"].includes(item.weaponType ?? "")) {
			return enchants.filter((enchant) => enchant.type === "Ranged");
		} else {
			return [];
		}
	}
	// weapon is shield if weaponType == shield
	// weapon is 2handed if handType == TwoHand
	if (item.type === "Weapon") {
		if (item.weaponType === "Shield") {
			return enchants.filter((enchant) => enchant.enchantType === "Shield");
		} else if (item.handType === "TwoHand") {
			return enchants.filter(
				(enchant) =>
					enchant.type === "Weapon" && enchant.enchantType !== "Shield",
			);
		}
		return enchants.filter(
			(enchant) => enchant.type === "Weapon" && !enchant.enchantType,
		);
	}

	// else its normal
	return enchants.filter((enchant) => enchant.type === item.type);
};

const EMPTY_SCORES = {
	avoidanceScore: 0,
	objectiveScore: 0,
	uncritabilityScore: 0,
	resistanceScores: {} as Partial<Record<StatName, number>>,
};

const sumResistanceScores = (
	a: Partial<Record<StatName, number>>,
	b: Partial<Record<StatName, number>>,
): Partial<Record<StatName, number>> => {
	const result: Partial<Record<StatName, number>> = { ...a };
	for (const [stat, value] of Object.entries(b) as [StatName, number][]) {
		result[stat] = (result[stat] ?? 0) + value;
	}
	return result;
};

export const getProcessedType = (item: Item): ProcessedItemType => {
	if (item.type === "Weapon" && item.weaponType === "Shield") {
		return "Shield";
	}
	return item.type;
};

export const transformItem = (
	item: ItemVariation,
	config: SolverConfiguration,
): LPItem => {
	const itemScores = config.calculateScoresForStats(item.stats);
	const enchantScores =
		item.enchant.stats.length > 0
			? config.calculateScoresForStats(item.enchant.stats)
			: EMPTY_SCORES;

	const gemScores = item.gems.reduce(
		(acc, gem) => {
			const scores = config.calculateScoresForStats(gem.stats);
			return {
				avoidanceScore: acc.avoidanceScore + scores.avoidanceScore,
				objectiveScore: acc.objectiveScore + scores.objectiveScore,
				uncritabilityScore: acc.uncritabilityScore + scores.uncritabilityScore,
				resistanceScores: sumResistanceScores(
					acc.resistanceScores,
					scores.resistanceScores,
				),
			};
		},
		EMPTY_SCORES,
	);

	const nonMetaSockets = item.sockets
		.map((s) => s.color)
		.filter((s) => s !== "Meta");
	const nonMetaGems = item.gems.map((g) => g.color).filter((g) => g !== "Meta");
	const socketBonusScores = gemsSatisfySocketBonus(nonMetaSockets, nonMetaGems)
		? config.calculateScoresForStats(item.socketBonus)
		: EMPTY_SCORES;

	const avoidanceScore =
		itemScores.avoidanceScore +
		enchantScores.avoidanceScore +
		gemScores.avoidanceScore +
		socketBonusScores.avoidanceScore;
	const objectiveScore =
		itemScores.objectiveScore +
		enchantScores.objectiveScore +
		gemScores.objectiveScore +
		socketBonusScores.objectiveScore;
	const uncritabilityScore =
		itemScores.uncritabilityScore +
		enchantScores.uncritabilityScore +
		gemScores.uncritabilityScore +
		socketBonusScores.uncritabilityScore;
	const resistanceScores = [
		itemScores.resistanceScores,
		enchantScores.resistanceScores,
		gemScores.resistanceScores,
		socketBonusScores.resistanceScores,
	].reduce(sumResistanceScores, {});

	return {
		...item,
		type: getProcessedType(item),
		avoidanceScore,
		objectiveScore,
		uncritabilityScore,
		resistanceScores,
	};
};
