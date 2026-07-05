// Interactive ROI Calculator for venues
function initRoiCalculator() {
  const slider = document.getElementById('player-slider');
  const countDisplay = document.getElementById('player-count');
  const revenueDisplay = document.getElementById('revenue-result');

  if (!slider || !countDisplay || !revenueDisplay) return;

  function updateCalculation() {
    const players = parseInt(slider.value, 10);
    countDisplay.textContent = players;

    // Venue calculations
    // Assume average spend per player on drinks/food is £18
    // Assume the event brings a 35% attendance lift and keeps patrons on average 2.5 hours longer
    const averageSpend = 18; 
    const upliftMultiplier = 1.35;
    const weeklyRevenue = Math.round(players * averageSpend * upliftMultiplier);

    // Format output with currency
    revenueDisplay.textContent = '£' + weeklyRevenue.toLocaleString();
  }

  slider.addEventListener('input', updateCalculation);
  updateCalculation();
}

// Simulated Interactive Bingo Card Demo
function initInteractiveDemo() {
  const cells = document.querySelectorAll('.demo-cell');
  const callButton = document.getElementById('demo-call-btn');
  const textHint = document.getElementById('demo-text-hint');

  if (!callButton || !textHint) return;

  const demoSongs = [
    { name: "Billie Jean", called: false, daubed: false },
    { name: "Dancing Queen", called: false, daubed: false },
    { name: "Bohemian Rhapsody", called: false, daubed: false },
    { name: "Sweet Child O' Mine", called: false, daubed: false },
    { name: "Stayin' Alive", called: false, daubed: false },
    { name: "Hotel California", called: false, daubed: false },
    { name: "Beat It", called: false, daubed: false },
    { name: "Wonderwall", called: false, daubed: false },
    { name: "Livin' on a Prayer", called: false, daubed: false }
  ];

  let currentCallIdx = 0;
  const callsOrder = [0, 4, 8, 1, 3, 5, 2, 7, 6]; // Demo call order

  // Set initial text inside demo grid cells
  cells.forEach((cell, idx) => {
    cell.textContent = demoSongs[idx].name;
    
    // Allow user to daub cells manually too!
    cell.addEventListener('click', () => {
      if (cell.classList.contains('called')) {
        cell.classList.toggle('daubed');
        
        // Check for demo win (all daubed)
        const allDaubed = Array.from(cells).every(c => !c.classList.contains('called') || c.classList.contains('daubed'));
        if (allDaubed) {
          textHint.innerHTML = "🎉 <strong>FULL HOUSE BINGO!</strong> You won the grand prize! 🎉";
          textHint.style.color = "var(--accent)";
        }
      } else {
        alert("You can only check off a song once the host plays/calls it!");
      }
    });
  });

  callButton.addEventListener('click', () => {
    if (currentCallIdx >= callsOrder.length) {
      // Reset demo
      cells.forEach(cell => cell.className = 'demo-cell');
      currentCallIdx = 0;
      textHint.innerHTML = "Click the button to simulate the Host playing a song!";
      textHint.style.color = "var(--text-muted)";
      callButton.textContent = "🎵 Play Next Track";
      return;
    }

    const nextTrackIdx = callsOrder[currentCallIdx];
    const song = demoSongs[nextTrackIdx];
    
    // Mark as called
    cells[nextTrackIdx].classList.add('called');
    textHint.innerHTML = `Host is now playing: <strong>${song.name}</strong>! Tap the cell on your card to check it off.`;
    textHint.style.color = "var(--accent)";

    currentCallIdx++;

    if (currentCallIdx === callsOrder.length) {
      callButton.textContent = "🔄 Reset Demo Game";
    }
  });
}

// Initialise everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initRoiCalculator();
  initInteractiveDemo();
});
