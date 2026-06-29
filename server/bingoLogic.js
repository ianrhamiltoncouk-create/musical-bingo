/**
 * Musical Bingo Card & Win Logic
 * 3x3 grid populated with unique song IDs from 1 to playlistSize.
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
  checkWin
};
