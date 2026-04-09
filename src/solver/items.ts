import Enchants from "../data/enchants.json";
import Gems from "../data/gems.json";
import Items from "../data/items.json";
import { overrideItem } from "./itemOverride";
import { ScoreCalculator } from "./ScoreCalculator";
import type { SolverConfiguration } from "./SolverConfiguration";
import { gemsSatisfySocketBonus } from "./socketBonus";
import type {
	Enchant,
	Gem,
	InputItem,
	Item,
	ItemVariation,
	LPItem,
	ProcessedItemType,
} from "./types";

const createEmptyEnchant = (): Enchant => {
	return {
		name: "",
		id: "",
		effectID: "",
		type: "Ranged",
		stats: [],
	}
}

export const getTransformedItems = (
	inputItems: InputItem[],
	config: SolverConfiguration,
) => {
	const calculator = new ScoreCalculator(config);
	const items = inputItems
		.map((item) => getItem(item))
		.filter((item) => !!item);
	const itemVariations = createItemVariations(
		items,
		calculator,
		config.areEnchantsGemsLocked,
	);
	const lpItems = itemVariations.map((item) =>
		transformItem(item, calculator),
	);
	return lpItems;
};

const getEnchants = (calculator: ScoreCalculator) => {
	let enchants = Enchants as Enchant[];
	enchants = enchants.filter((enchant) => enchant.stats.length > 0);
	enchants = enchants.filter((enchant) => calculator.hasRelevantStats(enchant.stats));
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

const getEnchantByEffectID = (effectID: string) => {
	const enchantToReturn = Enchants.find((e) => e.effectID === effectID);
	if (!enchantToReturn) {
		console.error(`Enchant not found with effectID: ${effectID}`);
		return undefined;
	}
	return enchantToReturn;
};

const getGems = (calculator: ScoreCalculator) => {
	let gems = Gems as Gem[];
	gems = gems.filter((gem) => gem.phase === "1");
	gems = gems.filter((gem) => !gem.isUnique);
	gems = gems.filter((gem) => gem.color !== "Meta");
	gems = gems.filter((gem) => gem.stats.length > 0);
	gems = gems.filter((gem) => calculator.hasRelevantStats(gem.stats));
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
	const enchant =
		(inputItem.enchant ? getEnchantByEffectID(inputItem.enchant) : undefined) ||
		createEmptyEnchant();

	const item: ItemVariation = {
		...baseItem,
		gems,
		enchant: enchant as Enchant,
		uniqueId: `${inputItem.id}-0`,
	};
	return item;
};

const createGemCombinations = (gems: Gem[], socketCount: number): Gem[][] => {
	const result: Gem[][] = [];

	function backtrack(start: number, current: Gem[]) {
		if (current.length === socketCount) {
			result.push([...current]);
			return;
		}

		for (let i = start; i < gems.length; i++) {
			current.push(gems[i]);
			backtrack(i, current);
			current.pop();
		}
	}

	backtrack(0, []);
	return result;
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

const createItemVariations = (
	items: ItemVariation[],
	calculator: ScoreCalculator,
	areEnchantsGemsLocked: boolean,
) => {
	const enchants = getEnchants(calculator);
	const gems = getGems(calculator);

	const itemVariations: ItemVariation[] = [];
	for (const item of items) {
		// "locking" enchants and gems means that if an item already has an enchant or any gems
		// we will not create any new variations
		if (areEnchantsGemsLocked && (item.gems.length > 0 || item.enchant.effectID !== "")) {
			itemVariations.push(item);
			continue;
		}
		let index = 0;
		let itemEnchants = getEnchantsForItem(item, enchants);
		// TODO deal with meta gems
		let socketLength = item.sockets.length;
		if (item.sockets.find((socket) => socket.color === "Meta")) {
			socketLength -= 1;
		}
		let itemGemCombinations = createGemCombinations(gems, socketLength);

		if (itemEnchants.length === 0) {
			itemEnchants = [
				{
					id: "",
					name: "",
					stats: [],
					effectID: "",
					type: "Trinket",
				},
			];
		}

		if (itemGemCombinations.length === 0) {
			itemGemCombinations = [
				[
					{
						id: "",
						name: "",
						stats: [],
						color: "Meta",
						phase: "1",
					},
				],
			];
		}
		for (const enchant of itemEnchants) {
			for (const gemCombination of itemGemCombinations) {
				itemVariations.push({
					...item,
					enchant: enchant,
					gems: gemCombination,
					uniqueId: `${item.id}-${index}`,
				});
				index++;
			}
		}
	}
	return itemVariations;
};

const transformItem = (
	item: ItemVariation,
	calculator: ScoreCalculator,
): LPItem => {
	const itemScores = calculator.calculateScoresForStats(item.stats);
	const enchantScores = item.enchant.stats.length > 0 
		? calculator.calculateScoresForStats(item.enchant.stats)
		: { avoidanceScore: 0, objectiveScore: 0, uncritabilityScore: 0 };

	const gemScores = item.gems.reduce((acc, gem) => {
		const scores = calculator.calculateScoresForStats(gem.stats);
		return {
			avoidanceScore: acc.avoidanceScore + scores.avoidanceScore,
			objectiveScore: acc.objectiveScore + scores.objectiveScore,
			uncritabilityScore: acc.uncritabilityScore + scores.uncritabilityScore,
		};
	}, { avoidanceScore: 0, objectiveScore: 0, uncritabilityScore: 0 });

	const nonMetaSockets = item.sockets
		.map((s) => s.color)
		.filter((s) => s !== "Meta");
	const nonMetaGems = item.gems.map((g) => g.color).filter((g) => g !== "Meta");
	const socketBonusScores = gemsSatisfySocketBonus(nonMetaSockets, nonMetaGems)
		? calculator.calculateScoresForStats(item.socketBonus)
		: { avoidanceScore: 0, objectiveScore: 0, uncritabilityScore: 0 };

	const avoidanceScore = itemScores.avoidanceScore + enchantScores.avoidanceScore + gemScores.avoidanceScore + socketBonusScores.avoidanceScore;
	const objectiveScore = itemScores.objectiveScore + enchantScores.objectiveScore + gemScores.objectiveScore + socketBonusScores.objectiveScore;
	const uncritabilityScore = itemScores.uncritabilityScore + enchantScores.uncritabilityScore + gemScores.uncritabilityScore + socketBonusScores.uncritabilityScore;

	let processedType: ProcessedItemType = item.type;
	if (item.type === "Weapon") {
		if (item.weaponType === "Shield") {
			processedType = "Shield";
		}
	}

	return {
		...item,
		type: processedType,
		avoidanceScore,
		objectiveScore,
		uncritabilityScore,
	};
};
