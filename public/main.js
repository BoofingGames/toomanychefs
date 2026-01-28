
document.addEventListener('DOMContentLoaded', () => {
    // --- Main Application State (will be synced with backend) ---
    let gameState = {};

    // --- DOM Element References ---
    const elements = {
        gridContainer: document.getElementById('grid-container'),
        spinButton: document.getElementById('spinButton'),
        winDisplay: document.getElementById('win-display'),
        provablyFairDisplay: document.getElementById('provably-fair-display'),
        turboButton: document.getElementById('turbo-button'),
        bonusBuyButton: document.getElementById('bonus-buy-button'),
        bonusBuyModal: document.getElementById('bonus-buy-modal'),
        confirmBonusBuy: document.getElementById('confirm-bonus-buy'),
        cancelBonusBuy: document.getElementById('cancel-bonus-buy'),
    };

    const constants = { 
        rows: 4, 
        cols: 6,
        baseAnimationSpeed: 147, 
        turboMultipliers: [1, 1.5, 2],
        autoSpinDelay: 500 // ms delay before auto-spinning for cascades/respins
    };
    let turboState = 0; // 0: Normal, 1: Turbo, 2: Super
    let isSpinning = false;

    // =================================================================================
    // --- CORE GAME LOOP (STATEFUL) ---
    // =================================================================================

    /**
     * Fetches the latest game state from the server and updates the UI.
     * Essential for session resumption.
     */
    async function syncGameState() {
        try {
            isSpinning = true;
            const response = await fetch('/api/state');
            if (!response.ok) throw new Error('Failed to fetch state');
            gameState = await response.json();

            console.log("Initial state synced:", gameState);
            updateGrid(gameState.currentGrid);
            updateUIFromState();

        } catch (error) {
            console.error('Could not sync game state:', error);
            elements.winDisplay.textContent = "Error: Connection failed.";
        } finally {
            isSpinning = false;
            updateSpinButton();
        }
    }

    /**
     * The new core game loop. Handles a single action and recursively calls itself if the round is not over.
     */
    async function handleSpin() {
        if (isSpinning) return;
        isSpinning = true;
        updateSpinButton();

        try {
            const response = await fetch("/api/spin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientSeed: Math.random().toString(36).substring(2), nonce: Date.now() })
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Spin failed');
            }

            const result = await response.json();

            // Animate the sequence of events from this single action
            await animateEventSequence(result.eventSequence, result.serverSeed);
            
            // Check if the round is over. The last event tells us everything.
            const lastEvent = result.eventSequence[result.eventSequence.length - 1];

            // If the round is NOT over (e.g., a cascade or wild move happened), automatically spin again.
            if (lastEvent.type !== 'ROUND_END' && lastEvent.type !== 'BONUS_SUMMARY') {
                setTimeout(handleSpin, getAnimationSpeed(constants.autoSpinDelay));
            } else {
                // The round is complete, wait for user input.
                isSpinning = false;
                await syncGameState(); // Re-sync to get final balance and state
            }

        } catch (e) {
            console.error("Spin Error:", e);
            alert(e.message);
            isSpinning = false;
            await syncGameState(); // Re-sync to correct state after an error
        }
    }
    
    /**
     * Initiates the Bonus Buy feature.
     */
    async function executeBonusBuy() {
        hideBonusBuyModal();
        if (isSpinning) return;
        isSpinning = true;
        updateSpinButton();

        try {
            const response = await fetch("/api/buy-bonus", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Bonus Buy failed');
            }
            const result = await response.json();
            alert(result.message);
            await syncGameState(); // Sync to show deducted balance and new state
            
        } catch (e) {
            console.error("Bonus Buy Error:", e);
            alert(e.message);
        } finally {
            isSpinning = false;
            updateSpinButton();
        }
    }

    // =================================================================================
    // --- UI & Animation ---
    // =================================================================================

    function updateUIFromState() {
        updateBalance(gameState.balance, gameState.roundWin, gameState.isInBonusMode, gameState.totalBonusWin);
        updateSpinButton();
    }

    function updateBalance(balance, roundWin = 0, inBonus = false, bonusWin = 0) {
        let winStr = `Win: ${roundWin.toFixed(2)}`;
        if (inBonus) {
            winStr = `Bonus Win: ${bonusWin.toFixed(2)}`;
        }
        elements.winDisplay.textContent = `${winStr} | Balance: ${balance.toFixed(2)}`;
    }

    function updateSpinButton() {
        elements.spinButton.disabled = isSpinning;
        elements.bonusBuyButton.disabled = isSpinning || (gameState.spinInProgress);

        if (isSpinning) {
            elements.spinButton.textContent = 'SPINNING...';
        } else if (gameState.isInBonusMode) {
            elements.spinButton.textContent = `FREE SPIN (${gameState.remainingFreeSpins} left)`;
        } else if (gameState.spinInProgress) {
            elements.spinButton.textContent = 'NEXT'; // For cascades/respins
        } else {
            elements.spinButton.textContent = 'SPIN';
        }
    }

    function toggleTurbo() {
        turboState = (turboState + 1) % 3;
        elements.turboButton.innerHTML = ['⚡️', '⚡️⚡️', '⚡️⚡️⚡️'][turboState];
    }
    
    function getAnimationSpeed(base) {
        return base / constants.turboMultipliers[turboState];
    }

    async function animateEventSequence(events, serverSeed) {
        for (const event of events) {
             // Update local state based on events as they happen
            if (event.type === 'ROUND_END') {
                gameState.balance = event.balance;
            }
            // --- Call animation functions for each event type (abbreviated) ---
            // console.log('Animating event:', event.type);
            await sleep(getAnimationSpeed(100)); // Simplified delay
        }
        updateGrid(events[events.length - 1].finalGrid || gameState.currentGrid);
        updateUIFromState();
        elements.provablyFairDisplay.textContent = `Server Seed: ${serverSeed}`;
    }

    // =================================================================================
    // --- Grid Drawing & Modal Logic ---
    // =================================================================================

    function createSymbolElement(symbol) {
        if (!symbol) return '';
        return `${symbol.id}`;
    }
    
    function updateGrid(grid) {
        if (!grid) return;
        gameState.currentGrid = grid;
        for (let row = 0; row < constants.rows; row++) {
            for (let col = 0; col < constants.cols; col++) {
                const cell = elements.gridContainer.children[row * constants.cols + col];
                if (cell) {
                    cell.className = 'cell'; 
                    cell.innerHTML = createSymbolElement(grid[row]?.[col]);
                }
            }
        }
    }

    function createGrid() {
        elements.gridContainer.innerHTML = '';
        for (let i = 0; i < constants.rows * constants.cols; i++) {
            const cell = document.createElement("div");
            cell.classList.add("cell");
            elements.gridContainer.appendChild(cell);
        }
    }

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    function showBonusBuyModal() { elements.bonusBuyModal.classList.remove('hidden'); }
    function hideBonusBuyModal() { elements.bonusBuyModal.classList.add('hidden'); }

    // =================================================================================
    // --- Initial Setup & Event Listeners ---
    // =================================================================================

    createGrid();
    syncGameState(); // Load the game state on page load!

    elements.spinButton.addEventListener('click', handleSpin);
    elements.turboButton.addEventListener('click', toggleTurbo);
    elements.bonusBuyButton.addEventListener('click', showBonusBuyModal);
    elements.confirmBonusBuy.addEventListener('click', executeBonusBuy);
    elements.cancelBonusBuy.addEventListener('click', hideBonusBuyModal);
});
