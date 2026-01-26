const gridContainer = document.getElementById('grid-container');
const spinButton = document.getElementById('spinButton');
const winDisplay = document.getElementById('win-display');
const rows = 3;
const cols = 6;
let cells = [];

// 1. Initialize Grid
function createGrid() {
    gridContainer.innerHTML = '';
    cells = [];
    for (let i = 0; i < rows * cols; i++) {
        const cell = document.createElement('div');
        cell.classList.add('grid-cell');
        cell.setAttribute('data-row', Math.floor(i / cols));
        cell.setAttribute('data-col', i % cols);
        gridContainer.appendChild(cell);
        cells.push(cell);
    }
}

// 2. Handle Spin Button Click
spinButton.addEventListener('click', async () => {
    spinButton.disabled = true;
    winDisplay.textContent = '...';
    
    // Reset styles
    cells.forEach(cell => cell.classList.remove('win'));

    // Animate spin (simple version)
    let spinInterval = setInterval(() => {
        cells.forEach(cell => {
            const randomSymbol = Math.floor(Math.random() * 8) + 1; // Random symbol for visual effect
            cell.textContent = randomSymbol;
        });
    }, 100);

    try {
        // 3. Fetch spin result from the server
        const response = await fetch('/api/spin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientSeed: `client-seed-${Math.random()}`, nonce: Date.now() })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();

        // Stop animation and display final results
        clearInterval(spinInterval);
        updateGrid(result.grid);
        highlightWins(result.winningPaylines);
        winDisplay.textContent = `Total Win: ${result.finalTotalWin.toFixed(2)}`;

    } catch (error) {
        clearInterval(spinInterval);
        console.error('Spin failed:', error);
        winDisplay.textContent = 'Error!';
    } finally {
        spinButton.disabled = false;
    }
});

// 4. Update Grid with Symbols
function updateGrid(grid) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = cells[r * cols + c];
            cell.textContent = grid[r][c] || '';
        }
    }
}

// 5. Highlight Winning Cells
function highlightWins(winningPaylines) {
    winningPaylines.forEach(line => {
        line.positions.forEach(pos => {
            const cell = cells[pos.row * cols + pos.col];
            cell.classList.add('win');
        });
    });
}

// Initial setup
createGrid();