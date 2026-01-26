"use strict";
// ========== INTERFACES & TYPES ==========
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameEngine = void 0;
// ========== CORE GAME ENGINE ==========
class GameEngine {
    constructor() {
        this.grid = [];
        this.wilds = [];
        this.nextWildId = 0;
        this.ROWS = 3;
        this.REELS = 6; // 5 standard reels + 1 modifier reel
        this.WILD_SPAWN_CHANCE = 0.15;
        // --- Game Symbols Definition ---
        this.symbols = {
            'tomato': { id: 'tomato', payouts: [0, 0, 5, 15, 50, 150] },
            'onion': { id: 'onion', payouts: [0, 0, 5, 15, 50, 150] },
            'pepper': { id: 'pepper', payouts: [0, 0, 8, 20, 60, 200] },
            'steak': { id: 'steak', payouts: [0, 0, 10, 30, 80, 300] },
        };
        this.symbolKeys = Object.keys(this.symbols);
        // --- Reel 6 Math Strategy ---
        this.reel6Modifiers = ['86d', 'x2', 'x10', 'x100', 'x500'];
        this.reel6Weights = [0.85, 0.1, 0.044, 0.005, 0.001];
        this.grid = Array.from({ length: this.ROWS }, () => Array(this.REELS).fill(null).map(() => ({ symbol: null, isWild: false })));
    }
    /**
     * Main entry point. Calculates the entire round sequence in one call.
     */
    resolveSpin(clientSeed, nonce) {
        const serverSeed = "PROVABLY_FAIR_SERVER_SEED"; // Should be securely generated
        const eventSequence = [];
        let totalWin = 0;
        let roundOver = false;
        // 1. Initial Spin
        this.populateGrid();
        eventSequence.push({ type: 'INITIAL_SPIN', grid: this.copyGrid(), totalWin });
        // 2. Main Game Loop
        while (!roundOver) {
            let winsThisCycle = 0;
            const paylines = this.evaluateWins();
            if (paylines.length > 0) {
                // Wins were found, process them
                const rawWin = this.calculateWin(paylines);
                const reel6Multiplier = this.evaluateReel6(paylines);
                winsThisCycle = rawWin * reel6Multiplier;
                totalWin += winsThisCycle;
                eventSequence.push({
                    type: 'WINS_CALCULATED',
                    grid: this.copyGrid(),
                    totalWin,
                    winThisEvent: winsThisCycle,
                    highlightedPaylines: paylines
                });
                if (reel6Multiplier > 1) {
                    eventSequence.push({
                        type: 'REEL6_APPLY_MULTIPLIER',
                        grid: this.copyGrid(),
                        totalWin,
                        activeMultiplier: reel6Multiplier
                    });
                }
                this.removeWinningSymbols(paylines);
                eventSequence.push({ type: 'CASCADE', grid: this.copyGrid(), totalWin });
                this.addNewSymbols();
                eventSequence.push({ type: 'SYMBOLS_DROPPED', grid: this.copyGrid(), totalWin });
            }
            // 3. Move Wilds and Check for Collisions
            if (this.wilds.length > 0) {
                this.moveWilds();
                eventSequence.push({ type: 'WILD_MOVE', grid: this.copyGrid(), totalWin });
                if (this.checkCollision()) {
                    if (Math.random() < 0.5) { // 50% Bust
                        eventSequence.push({ type: 'COLLISION_BUST', grid: this.copyGrid(), totalWin: 0 });
                        totalWin = 0;
                        roundOver = true;
                        continue; // End the loop immediately
                    }
                    else { // 50% Merge
                        this.mergeWilds();
                        eventSequence.push({ type: 'COLLISION_MERGE', grid: this.copyGrid(), totalWin });
                    }
                }
            }
            // 4. Check if the round should end
            const newPaylines = this.evaluateWins();
            if (paylines.length === 0 && newPaylines.length === 0 && this.wilds.length === 0) {
                roundOver = true;
            }
        }
        eventSequence.push({ type: 'ROUND_END', grid: this.copyGrid(), totalWin });
        return {
            finalTotalWin: totalWin,
            eventSequence,
            provablyFair: { serverSeed, clientSeed, nonce, finalHash: "FINAL_HASH_PLACEHOLDER" }
        };
    }
    /**
     * Finds all winning paylines on the current grid.
     * A payline is 3 or more matching symbols from left-to-right on a single row.
     * Wilds substitute for any symbol.
     */
    evaluateWins() {
        const allPaylines = [];
        for (let r = 0; r < this.ROWS; r++) {
            const row = this.grid[r];
            let lineSymbol = null;
            let count = 0;
            // Find the first non-wild symbol to determine the payline's symbol
            for (let c = 0; c < this.REELS - 1; c++) {
                if (row[c].symbol && !row[c].isWild) {
                    lineSymbol = row[c].symbol;
                    break;
                }
            }
            // If no symbol found (e.g., all wilds), use the first wild as a placeholder
            if (!lineSymbol && row[0].isWild) {
                // In a real game, you might want a rule for all-wild lines.
                // Here, we'll just say it can't form a line on its own.
                continue;
            }
            if (lineSymbol) {
                // Count consecutive symbols or wilds from the left
                for (let c = 0; c < this.REELS - 1; c++) {
                    const point = row[c];
                    if (point.isWild || (point.symbol && point.symbol.id === lineSymbol.id)) {
                        count++;
                    }
                    else {
                        break; // End of the consecutive line
                    }
                }
            }
            if (count >= 2) { // Minimum of 2 symbols for a payout
                const winAmount = this.symbols[lineSymbol.id]?.payouts[count] ?? 0;
                if (winAmount > 0) {
                    allPaylines.push({
                        symbolId: lineSymbol.id,
                        count: count,
                        isFiveOfAKind: count === 5,
                        row: r,
                        winAmount: winAmount,
                    });
                }
            }
        }
        return allPaylines;
    }
    /**
     * Calculates the total win from a list of paylines.
     */
    calculateWin(paylines) {
        return paylines.reduce((total, line) => total + line.winAmount, 0);
    }
    /**
     * Removes winning symbols from the grid, leaving nulls. Wilds are not removed.
     */
    removeWinningSymbols(paylines) {
        for (const line of paylines) {
            for (let c = 0; c < line.count; c++) {
                const point = this.grid[line.row][c];
                // We only remove symbols that are not walking wilds or merged mega wilds
                if (!point.isWild) {
                    this.grid[line.row][c].symbol = null;
                }
            }
        }
    }
    /**
     * Fills empty spaces on the grid by dropping symbols from above,
     * and generating new ones at the top.
     */
    addNewSymbols() {
        for (let c = 0; c < this.REELS - 1; c++) { // Iterate reels
            for (let r = this.ROWS - 1; r >= 0; r--) { // Iterate rows from bottom to top
                if (this.grid[r][c].symbol === null) {
                    // Find the first non-null symbol above the current empty spot
                    let pullRow = -1;
                    for (let rAbove = r - 1; rAbove >= 0; rAbove--) {
                        if (this.grid[rAbove][c].symbol !== null) {
                            pullRow = rAbove;
                            break;
                        }
                    }
                    if (pullRow !== -1) {
                        // Symbol found above, move it down
                        this.grid[r][c] = this.grid[pullRow][c];
                        this.grid[pullRow][c] = { symbol: null, isWild: false };
                    }
                    else {
                        // No symbol above, generate a new one at the top of the reel
                        this.grid[r][c] = { symbol: this.getRandomSymbol(), isWild: false };
                    }
                }
            }
        }
    }
    /**
     * Merges colliding wilds into a 2x2 sticky wild block.
     */
    mergeWilds() {
        const collisionPoints = new Map();
        // Find all collision points
        for (const wild of this.wilds) {
            const posKey = `${wild.row},${wild.col}`;
            if (!collisionPoints.has(posKey)) {
                collisionPoints.set(posKey, []);
            }
            collisionPoints.get(posKey).push(wild);
        }
        // Process collisions
        for (const [posKey, collidingWilds] of collisionPoints.entries()) {
            if (collidingWilds.length > 1) {
                const [row, col] = posKey.split(',').map(Number);
                // Create 2x2 wild block around the collision point
                for (let r = row; r < Math.min(this.ROWS, row + 2); r++) {
                    for (let c = col; c < Math.min(this.REELS - 1, col + 2); c++) {
                        this.grid[r][c] = {
                            symbol: { id: 'sous_chef_wild', payouts: [] },
                            isWild: true,
                            isMegaWild: true // Mark as part of the merged block
                        };
                    }
                }
                // Remove the walking wilds that were part of this collision
                for (const wildToRemove of collidingWilds) {
                    const index = this.wilds.findIndex(w => w.id === wildToRemove.id);
                    if (index !== -1) {
                        this.wilds.splice(index, 1);
                    }
                }
            }
        }
    }
    /**
     * Populates the initial grid, spawning wilds only on Reel 5.
     */
    populateGrid() {
        this.wilds = [];
        this.nextWildId = 0;
        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.REELS - 1; c++) {
                if (c === 4 && Math.random() < this.WILD_SPAWN_CHANCE) {
                    const wildId = this.nextWildId++;
                    const newWild = { id: wildId, row: r, col: c };
                    this.wilds.push(newWild);
                    this.grid[r][c] = {
                        symbol: { id: 'sous_chef_wild', payouts: [] },
                        isWild: true,
                        wildInstanceId: wildId
                    };
                }
                else {
                    this.grid[r][c] = { symbol: this.getRandomSymbol(), isWild: false };
                }
            }
        }
    }
    /**
     * Moves all active walking wilds one step to the left.
     */
    moveWilds() {
        for (let i = this.wilds.length - 1; i >= 0; i--) {
            const wild = this.wilds[i];
            // Clear current position if it isn't a merged MegaWild
            if (!this.grid[wild.row][wild.col].isMegaWild) {
                this.grid[wild.row][wild.col] = { symbol: null, isWild: false };
            }
            wild.col -= 1;
            if (wild.col < 0) {
                this.wilds.splice(i, 1); // Remove wild if it walks off the grid
            }
            else {
                // Place wild in new position, preserving what's underneath if it's a megawild
                this.grid[wild.row][wild.col] = {
                    ...this.grid[wild.row][wild.col], // Keep existing symbol if any
                    isWild: true,
                    wildInstanceId: wild.id
                };
            }
        }
    }
    /**
     * Checks if any two walking wilds are on the same grid point.
     */
    checkCollision() {
        const positions = new Set();
        for (const wild of this.wilds) {
            const posKey = `${wild.row},${wild.col}`;
            if (positions.has(posKey)) {
                return true; // Collision detected
            }
            positions.add(posKey);
        }
        return false;
    }
    /**
     * Applies a multiplier from Reel 6 if a 5-of-a-kind win occurred.
     */
    evaluateReel6(paylines) {
        if (paylines.some(p => p.isFiveOfAKind)) {
            return this.getReel6Outcome();
        }
        return 1;
    }
    getReel6Outcome() {
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < this.reel6Weights.length; i++) {
            cumulative += this.reel6Weights[i];
            if (rand < cumulative) {
                const modifier = this.reel6Modifiers[i];
                if (modifier.startsWith('x')) {
                    return parseInt(modifier.substring(1), 10);
                }
                else {
                    return 1; // "86'd" acts as a x1 multiplier
                }
            }
        }
        return 1;
    }
    getRandomSymbol() {
        const key = this.symbolKeys[Math.floor(Math.random() * this.symbolKeys.length)];
        return this.symbols[key];
    }
    copyGrid() {
        return this.grid.map(row => row.map(cell => ({ ...cell })));
    }
}
exports.GameEngine = GameEngine;
