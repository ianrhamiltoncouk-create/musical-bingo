/**
 * Musical Bingo Card & Win Logic
 */

function generateMusicalCard(playlistSize) {
  const size = Math.max(9, playlistSize);
  const songs = [];
  while (songs.length < 9) {
    const id = Math.floor(Math.random() * size) + 1;
    if (!songs.includes(id)) {
      songs.push(id);
    }
  }
  
  // Arrange into a 3x3 grid
  return [
    [songs[0], songs[1], songs[2]],
    [songs[3], songs[4], songs[5]],
    [songs[6], songs[7], songs[8]]
  ];
}

/**
 * Generates a Party Climax (Massive Win) card containing the 3 shared anchors.
 * Anchors are placed in non-corner slots, leaving outer corners for normal unique songs.
 */
function generatePartyClimaxCard(playlistSize, anchors) {
  const size = Math.max(9, playlistSize);
  const grid = [
    [null, null, null],
    [null, null, null],
    [null, null, null]
  ];
  
  // Non-corner slots to distribute the 3 anchors
  const excludeTop = Math.random() < 0.5;
  const allowedNonCorners = [
    [1, 0],
    [1, 1],
    [1, 2]
  ];
  if (excludeTop) {
    allowedNonCorners.push([2, 1]);
  } else {
    allowedNonCorners.push([0, 1]);
  }
  
  // Shuffle allowed slots and pick 3
  for (let i = allowedNonCorners.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allowedNonCorners[i], allowedNonCorners[j]] = [allowedNonCorners[j], allowedNonCorners[i]];
  }
  const anchorSlots = allowedNonCorners.slice(0, 3);
  
  // Place the 3 anchors
  for (let i = 0; i < 3; i++) {
    const [r, c] = anchorSlots[i];
    grid[r][c] = anchors[i];
  }
  
  // Fill the remaining 6 slots with unique random song IDs (excluding anchors)
  const used = new Set(anchors);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (grid[r][c] === null) {
        let id;
        do {
          id = Math.floor(Math.random() * size) + 1;
        } while (used.has(id));
        grid[r][c] = id;
        used.add(id);
      }
    }
  }
  
  return grid;
}

function checkWin(card, calledNumbers) {
  const calledSet = new Set(calledNumbers);
  
  // 1. Full House (All 9)
  const allNums = card.flat();
  const markedCount = allNums.filter(n => calledSet.has(n)).length;
  const hasFullHouse = markedCount === 9;

  // 2. Line & Two Lines (Horizontal rows only)
  const completedRows = card.filter(r => r.every(n => calledSet.has(n))).length;
  const hasLine = completedRows >= 1;
  const hasTwoLines = completedRows >= 2;

  return {
    hasTwoLines,
    hasLine,
    hasFullHouse
  };
}

module.exports = {
  generateMusicalCard,
  generatePartyClimaxCard,
  checkWin
};
