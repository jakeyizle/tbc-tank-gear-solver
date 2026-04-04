type SocketColor = 'Red' | 'Blue' | 'Yellow';
type GemColor = 'Red' | 'Blue' | 'Yellow' | 'Purple' | 'Green' | 'Orange';

const gemColorMatches: Record<SocketColor, GemColor[]> = {
  Red: ['Red', 'Purple', 'Orange'],
  Blue: ['Blue', 'Purple', 'Green'],
  Yellow: ['Yellow', 'Green', 'Orange'],
};

function generateValidSocketCombos(sockets: SocketColor[]): GemColor[][] {
  const result: GemColor[][] = [];

  function backtrack(index: number, current: GemColor[]) {
    if (index === sockets.length) {
      result.push([...current]);
      return;
    }

    const socket = sockets[index];
    for (const gem of gemColorMatches[socket]) {
      current.push(gem);
      backtrack(index + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

export function gemsSatisfySocketBonus(sockets: SocketColor[], gems: GemColor[]): boolean {
  const combos = generateValidSocketCombos(sockets);

  // convert gems to a multiset
  const gemCounts: Record<GemColor, number> = {
    Red: 0,
    Blue: 0,
    Yellow: 0,
    Purple: 0,
    Green: 0,
    Orange: 0,
  };
  for (const gem of gems) gemCounts[gem] = (gemCounts[gem]) + 1;

  // helper to check if a combo can be satisfied by available gems
  function canMatch(combo: GemColor[]): boolean {
    const countsCopy = { ...gemCounts };
    for (const gem of combo) {
      if (!countsCopy[gem] || countsCopy[gem] === 0) return false;
      countsCopy[gem]--;
    }
    return true;
  }

  return combos.some(canMatch);
}