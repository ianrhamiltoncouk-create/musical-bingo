/**
 * Musical Bingo Card & Win Logic
 */

function generateMusicalCard(playlistSize, gridSize = 3, freeSpaceEnabled = false) {
  const cellCount = gridSize * gridSize;
  const size = Math.max(cellCount, playlistSize);
  const songs = [];
  while (songs.length < cellCount) {
    const id = Math.floor(Math.random() * size) + 1;
    if (!songs.includes(id)) {
      songs.push(id);
    }
  }
  
  // Arrange into grid
  const grid = [];
  for (let r = 0; r < gridSize; r++) {
    const row = [];
    for (let c = 0; c < gridSize; c++) {
      row.push(songs[r * gridSize + c]);
    }
    grid.push(row);
  }

  // Insert FREE space if enabled
  if (freeSpaceEnabled) {
    const center = Math.floor(gridSize / 2);
    grid[center][center] = "FREE";
  }
  
  return grid;
}

/**
 * Generates a Party Climax (Massive Win) card containing the 3 shared anchors.
 */
function generatePartyClimaxCard(playlistSize, anchors, gridSize = 3, freeSpaceEnabled = false) {
  if (gridSize === 3) {
    const grid = [
      [null, null, null],
      [null, null, null],
      [null, null, null]
    ];
    
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
    
    for (let i = allowedNonCorners.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allowedNonCorners[i], allowedNonCorners[j]] = [allowedNonCorners[j], allowedNonCorners[i]];
    }
    const anchorSlots = allowedNonCorners.slice(0, 3);
    
    for (let i = 0; i < 3; i++) {
      const [r, c] = anchorSlots[i];
      grid[r][c] = anchors[i];
    }
    
    const used = new Set(anchors);
    const size = Math.max(9, playlistSize);
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

    if (freeSpaceEnabled) {
      grid[1][1] = "FREE";
    }
    return grid;
  } else {
    // 4x4 Climax Card
    const grid = Array.from({ length: 4 }, () => Array(4).fill(null));
    const allowedNonCorners = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const isCorner = (r === 0 && c === 0) || (r === 0 && c === 3) || (r === 3 && c === 0) || (r === 3 && c === 3);
        if (!isCorner) {
          allowedNonCorners.push([r, c]);
        }
      }
    }
    
    for (let i = allowedNonCorners.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allowedNonCorners[i], allowedNonCorners[j]] = [allowedNonCorners[j], allowedNonCorners[i]];
    }
    const anchorSlots = allowedNonCorners.slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const [r, c] = anchorSlots[i];
      grid[r][c] = anchors[i];
    }
    
    const used = new Set(anchors);
    const size = Math.max(16, playlistSize);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
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

    if (freeSpaceEnabled) {
      grid[2][2] = "FREE";
    }
    return grid;
  }
}

function checkWin(card, calledNumbers) {
  const calledSet = new Set(calledNumbers);
  calledSet.add("FREE"); // FREE cell is always called
  
  const size = card.length;
  
  // 1. Full House (All cells marked)
  const allNums = card.flat();
  const markedCount = allNums.filter(n => calledSet.has(n)).length;
  const hasFullHouse = markedCount === size * size;

  // 2. Line & Two Lines (Horizontal rows only)
  const completedRows = card.filter(row => row.every(n => calledSet.has(n))).length;
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
