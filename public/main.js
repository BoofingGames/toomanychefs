
document.addEventListener('DOMContentLoaded', () => {
    // --- Main Application State (synced with backend) ---
    let gameState = {};
    let isSpinning = false; // Prevents USER from starting a new spin while a cycle is active.
    let turboState = 0; // 0: Normal, 1: Turbo, 2: Super

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
        rows: 4, cols: 6, baseAnimationSpeed: 147, baseBetCost: 10,
        turboMultipliers: [1, 1.5, 2],
        autoSpinDelay: 300
    };

    // =================================================================================
    // --- CORE STATEFUL GAME LOOP (Corrected Logic) ---
    // =================================================================================

    async function syncGameState() {
        try {
            const response = await fetch('/api/state');
            if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
            gameState = await response.json();
            console.log("State synced:", gameState);
            updateGrid(gameState.currentGrid);
            updateUIFromState();
        } catch (error) {
            console.error('Could not sync game state:', error);
            elements.winDisplay.textContent = "Error: Connection failed.";
        }
    }

    // Kicks off the spin process.
    function handleSpin() {
        if (isSpinning) return;
        isSpinning = true;
        updateSpinButton();
        executeAndAnimateSpin(); // Renamed for clarity
    }

    // The backend resolves the entire spin in one call. This function fetches the result
    // and animates the sequence of events provided.
    async function executeAndAnimateSpin() {
        try {
            const response = await fetch("/api/spin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientSeed: Math.random().toString(36).substring(2), nonce: Date.now() })
            });

            if (!response.ok) {
                // Try to parse the error message from the backend
                const errorData = await response.json().catch(() => null); 
                throw new Error(errorData?.error || 'Spin failed with an unknown error');
            }
            
            const result = await response.json();

            // The backend returns the full sequence of events for a spin. We just need to animate it.
            await animateEventSequence(result.eventSequence, result.serverSeed);

            // After the animation is complete, the spin is over. Re-sync with the server for the final state.
            isSpinning = false;
            await syncGameState();

        } catch (e) {
            console.error("Spin Error:", e);
            alert(e.message);
            isSpinning = false; // Ensure UI is unlocked on error
            await syncGameState(); // Attempt to re-sync to a known good state
        }
    }

    async function executeBonusBuy() {
        hideBonusBuyModal();
        if (isSpinning) return;
        isSpinning = true;
        updateSpinButton();
        try {
            const response = await fetch("/api/buy-bonus", { method: "POST", headers: { "Content-Type": "application/json" } });
            if (!response.ok) throw new Error((await response.json()).error || 'Bonus Buy failed');
            await syncGameState(); // Sync to show the deducted balance
            alert('Bonus Buy initiated! Press SPIN to play.');
        } catch (e) {
            alert(e.message);
        } finally {
            isSpinning = false;
            updateSpinButton();
        }
    }

    // =================================================================================
    // --- UI, ANIMATION & OPTIMISTIC STATE UPDATES ---
    // =================================================================================

    function updateUIFromState() {
        if (!gameState) return;
        updateBalance();
        updateSpinButton();
    }

    function updateBalance() {
        const { balance, roundWin, isInBonusMode, totalBonusWin } = gameState;
        const winStr = isInBonusMode ? `Bonus Win: ${(totalBonusWin || 0).toFixed(2)}` : `Win: ${(roundWin || 0).toFixed(2)}`;
        elements.winDisplay.textContent = `${winStr} | Balance: ${(balance || 0).toFixed(2)}`;
    }

    function updateSpinButton() {
        const inProgress = isSpinning || gameState.spinInProgress;
        elements.spinButton.disabled = inProgress;
        elements.bonusBuyButton.disabled = inProgress;
        if (inProgress) {
            elements.spinButton.textContent = 'SPINNING...';
        } else if (gameState.isInBonusMode) {
            elements.spinButton.textContent = `FREE SPIN (${gameState.remainingFreeSpins} left)`;
        } else {
            elements.spinButton.textContent = 'SPIN';
        }
    }

    async function animateEventSequence(events, serverSeed) {
        for (const event of events) {
            // --- OPTIMISTIC STATE UPDATE --- 
            // Update the local gameState as events come in, so the UI feels responsive.
            switch(event.type) {
                case 'SPIN_START':
                    if (!gameState.isInBonusMode) {
                        gameState.balance -= constants.baseBetCost;
                    }
                    gameState.roundWin = 0;
                    updateBalance();
                    break;
                case 'WIN':
                    gameState.roundWin = event.currentRoundWin;
                    if (gameState.isInBonusMode) {
                        gameState.totalBonusWin = (gameState.totalBonusWin || 0) + event.paylines.reduce((s,p) => s+p.winAmount,0);
                    }
                    updateBalance();
                    break;
                case 'ROUND_END':
                    gameState.balance = event.balance; // Final balance from server
                    gameState.roundWin = 0;
                    updateBalance();
                    break;
            }

            // --- ANIMATION --- 
            switch (event.type) {
                case 'SPIN_START':
                    updateGrid(event.grid);
                    await animateInitialSpin();
                    break;
                case 'WIN':
                    await animateWin(event.paylines);
                    break;
                case 'CASCADE':
                    await animateCascade(event.clearedPositions);
                    break;
                case 'REFILL':
                    updateGrid(event.newGrid);
                    await sleep(getAnimationSpeed(200));
                    break;
                case 'BONUS_TRIGGERED':
                    await animateBonusTriggered(event.spinCount);
                    break;
                case 'BONUS_SUMMARY':
                    alert(`Bonus complete! Total win: ${event.totalBonusWin.toFixed(2)}`);
                    break;
                default:
                    await sleep(getAnimationSpeed(100));
                    break;
            }
        }
        if (serverSeed) elements.provablyFairDisplay.textContent = `Server Seed: ${serverSeed}`;
    }

    // --- Animation & Helper Functions (Unchanged) ---
    const getAnimationSpeed = (base) => base / constants.turboMultipliers[turboState];
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const getCell = (row, col) => elements.gridContainer.children[row * constants.cols + col];
    const toggleTurbo = () => { turboState = (turboState + 1) % 3; elements.turboButton.innerHTML = ['⚡️', '⚡️⚡️', '⚡️⚡️⚡️'][turboState]; };
    const showBonusBuyModal = () => elements.bonusBuyModal.classList.remove('hidden');
    const hideBonusBuyModal = () => elements.bonusBuyModal.classList.add('hidden');
    const updateGrid = (grid) => { if (!grid) return; gameState.currentGrid = grid; for (let r = 0; r < constants.rows; r++) for (let c = 0; c < constants.cols; c++) { const cell = getCell(r, c); if (cell) cell.innerHTML = grid[r]?.[c]?.id?.replace('_', ' ') || ''; } };
    const createGrid = () => { elements.gridContainer.innerHTML = ''; for (let i = 0; i < constants.rows * constants.cols; i++) { const cell = document.createElement("div"); cell.classList.add('cell'); elements.gridContainer.appendChild(cell); } };
    const animateInitialSpin = async () => { for (let c = 0; c < constants.cols; c++) { for (let r = 0; r < constants.rows; r++) { const cell = getCell(r, c); if (!cell) continue; cell.style.transition = 'none'; cell.style.transform = `translateY(-200px)`; await sleep(5); cell.style.transition = 'transform 0.5s ease-out'; cell.style.transform = 'translateY(0)'; } await sleep(getAnimationSpeed(50)); } };
    const animateWin = async (paylines) => { paylines.forEach(p => p.positions.forEach(pos => getCell(pos.row, pos.col)?.classList.add('win'))); await sleep(getAnimationSpeed(400)); paylines.forEach(p => p.positions.forEach(pos => getCell(pos.row, pos.col)?.classList.remove('win'))); };
    const animateCascade = async (clearedPositions) => { clearedPositions.forEach(pos => { const cell = getCell(pos.row, pos.col); if(cell) { cell.classList.remove('win'); cell.classList.add('cascade'); } }); await sleep(getAnimationSpeed(300)); clearedPositions.forEach(pos => { const cell = getCell(pos.row, pos.col); if(cell) cell.innerHTML = ''; }); };
    const animateBonusTriggered = async (spinCount) => { elements.winDisplay.textContent = `BONUS! ${spinCount} FREE SPINS!`; await sleep(2000); };

    // --- Initial Setup & Event Listeners ---
    createGrid();
    syncGameState();
    elements.spinButton.addEventListener('click', handleSpin);
    elements.turboButton.addEventListener('click', toggleTurbo);
    elements.bonusBuyButton.addEventListener('click', showBonusBuyModal);
    elements.confirmBonusBuy.addEventListener('click', executeBonusBuy);
    elements.cancelBonusBuy.addEventListener('click', hideBonusBuyModal);
});
