
import * as crypto from 'crypto';
import { GameConfig, PAYTABLE, SYMBOLS } from './GameConfig.js';

// =================================================================================
// --- Game State & Events ---
// =================================================================================

export interface Payline {
    symbol: number;
    count: number;
    winAmount: number;
    positions: number[];
    isScatter: boolean;
}

export type GameEvent =
    | { type: 'SPIN_STARTED' }
    | { type: 'GRID_UPDATED'; grid: number[] }
    | { type: 'WIN'; paylines: Payline[]; isBonusSpin: boolean }
    | { type: 'CASCADE_STARTED' }
    | { type: 'BONUS_TRIGGERED', freeSpinsAwarded: number }
    | { type: 'BONUS_SPIN_STARTED' };

export interface GameState {
    playerId: string;
    grid: number[];
    freeSpinsRemaining: number;
    totalBonusWin: number;
    spinInProgress: boolean; // Is the game in a state of automatic actions (cascades, free spins)?
    wildPosition: number | null;
}

// =================================================================================
// --- The Game Engine ---
// =================================================================================

export class GameEngine {
    private serverSeed: string;
    private clientSeed: string;

    constructor(serverSeed: string, clientSeed: string) {
        this.serverSeed = serverSeed;
        this.clientSeed = clientSeed;
    }

    public static getInitialState(playerId: string): GameState {
        // Generate a random starting grid without a wild, as it's placed later.
        const symbolsWithoutWild = SYMBOLS.filter(s => s !== GameConfig.WILD_SYMBOL);
        const initialGrid = Array(GameConfig.GRID_SIZE).fill(0).map(() =>
            symbolsWithoutWild[Math.floor(Math.random() * symbolsWithoutWild.length)]
        );

        return {
            playerId: playerId,
            grid: initialGrid,
            freeSpinsRemaining: 0,
            totalBonusWin: 0,
            spinInProgress: false,
            wildPosition: null
        };
    }

    /**
     * The main entry point for processing a single step in a game round.
     * This function is now responsible for handling all game logic, including
     * initial spins, cascades, and bonus spins.
     * 
     * @param currentState The state of the game before this step.
     * @param nonce The unique number for this specific action in the round.
     * @returns The new state and the events that occurred during this step.
     */
    public processSpin(currentState: GameState, nonce: number) {
        const eventSequence: GameEvent[] = [];
        let totalWinInStep = 0;
        let newGrid = [...currentState.grid];
        let newWildPosition = currentState.wildPosition;

        // --- Determine Action: Is this a bonus spin or a normal spin/cascade? ---
        const isBonusSpin = currentState.freeSpinsRemaining > 0 && currentState.spinInProgress;

        if (isBonusSpin) {
            // --- Action: Process a Bonus Free Spin ---
            eventSequence.push({ type: 'BONUS_SPIN_STARTED' });
            newGrid = this.generateGrid(nonce, false); // No scatters in bonus spins
            let newSpinsRemaining = currentState.freeSpinsRemaining - 1;
            let { gridAfterWild, wildPosition } = this.placeOrMoveWild(newGrid, newWildPosition, nonce);
            newGrid = gridAfterWild;
            newWildPosition = wildPosition;
            eventSequence.push({ type: 'GRID_UPDATED', grid: newGrid });

            const { paylines, gridAfterWin } = this.calculateWins(newGrid);
            if (paylines.length > 0) {
                const winAmount = paylines.reduce((sum, p) => sum + p.winAmount, 0);
                totalWinInStep += winAmount;
                eventSequence.push({ type: 'WIN', paylines, isBonusSpin: true });
                newGrid = this.handleCascade(newGrid, gridAfterWin, nonce + 1); // Use next nonce for cascade fill
                eventSequence.push({ type: 'CASCADE_STARTED' });
                eventSequence.push({ type: 'GRID_UPDATED', grid: newGrid });
            }

            return {
                newState: {
                    ...currentState,
                    grid: newGrid,
                    freeSpinsRemaining: newSpinsRemaining,
                    totalBonusWin: currentState.totalBonusWin + totalWinInStep,
                    spinInProgress: newSpinsRemaining > 0 || this.hasWins(newGrid), // Continue if more spins or cascade wins
                    wildPosition: newWildPosition
                },
                eventSequence,
                totalWinInStep,
            };

        } else {
            // --- Action: Process a Normal Spin or a Cascade ---
            const isInitialSpin = !currentState.spinInProgress;
            if (isInitialSpin) {
                eventSequence.push({ type: 'SPIN_STARTED' });
                newGrid = this.generateGrid(nonce, true);
                newWildPosition = null; // Reset wild on a new paid spin
            }
            
            let { gridAfterWild, wildPosition } = this.placeOrMoveWild(newGrid, newWildPosition, nonce);
            newGrid = gridAfterWild;
            newWildPosition = wildPosition;
            eventSequence.push({ type: 'GRID_UPDATED', grid: newGrid });

            const { paylines, gridAfterWin } = this.calculateWins(newGrid);
            let bonusSpinsAwarded = this.checkForBonusTrigger(newGrid);

            if (bonusSpinsAwarded > 0) {
                eventSequence.push({ type: 'BONUS_TRIGGERED', freeSpinsAwarded: bonusSpinsAwarded });
            }

            if (paylines.length > 0) {
                const winAmount = paylines.reduce((sum, p) => sum + p.winAmount, 0);
                totalWinInStep += winAmount;
                eventSequence.push({ type: 'WIN', paylines, isBonusSpin: false });
                newGrid = this.handleCascade(newGrid, gridAfterWin, nonce + 1); // Use next nonce for cascade fill
                eventSequence.push({ type: 'CASCADE_STARTED' });
                eventSequence.push({ type: 'GRID_UPDATED', grid: newGrid });
            }

            const hasCascadeWins = this.hasWins(newGrid);

            return {
                newState: {
                    ...currentState,
                    grid: newGrid,
                    freeSpinsRemaining: currentState.freeSpinsRemaining + bonusSpinsAwarded,
                    spinInProgress: bonusSpinsAwarded > 0 || hasCascadeWins, // The critical state change
                    wildPosition: newWildPosition,
                },
                eventSequence,
                totalWinInStep
            };
        }
    }

    // =================================================================================
    // --- Core Game Mechanics ---
    // =================================================================================

    /** Generates a new grid of symbols using the cryptographic seed data. */
    private generateGrid(nonce: number, allowScatters: boolean): number[] {
        const symbolsToUse = allowScatters ? SYMBOLS : SYMBOLS.filter(s => s !== GameConfig.SCATTER_SYMBOL);
        const grid: number[] = [];
        const hmac = crypto.createHmac('sha256', this.serverSeed);
        hmac.update(`${this.clientSeed}-${nonce}`);
        const hash = hmac.digest();

        for (let i = 0; i < GameConfig.GRID_SIZE; i++) {
            // Use parts of the hash to generate symbols, ensuring distribution.
            const hashIndex = i % (hash.length - 1);
            const symbolIndex = (hash[hashIndex] + hash[hashIndex + 1]) % symbolsToUse.length;
            grid.push(symbolsToUse[symbolIndex]);
        }
        return grid;
    }
    
    /** Places the wild symbol for the first time or moves it during bonus rounds. */
    private placeOrMoveWild(grid: number[], currentWildPosition: number | null, nonce: number) {
        let newGrid = [...grid];
        let newPosition: number;
        const hmac = crypto.createHmac('sha256', this.serverSeed);
        hmac.update(`wild-${this.clientSeed}-${nonce}`);
        const hash = hmac.digest();

        if (currentWildPosition === null) {
            // Place initial wild, avoid placing on a scatter
            const possiblePositions = [...Array(GameConfig.GRID_SIZE).keys()].filter(p => newGrid[p] !== GameConfig.SCATTER_SYMBOL);
            newPosition = possiblePositions[hash[0] % possiblePositions.length];
        } else {
            // Move existing wild to an adjacent, valid position
            const adjacent = this.getAdjacentPositions(currentWildPosition);
            newPosition = adjacent[hash[1] % adjacent.length];
            newGrid[currentWildPosition] = this.generateRandomSymbol(nonce + 100); // Replace old position
        }

        newGrid[newPosition] = GameConfig.WILD_SYMBOL;
        return { gridAfterWild: newGrid, wildPosition: newPosition };
    }

    /** Calculates all winning paylines on the grid. */
    private calculateWins(grid: number[]): { paylines: Payline[], gridAfterWin: number[] } {
        const paylines: Payline[] = [];
        let gridAfterWin = [...grid];
        const wildPositions = this.getSymbolPositions(grid, GameConfig.WILD_SYMBOL);

        // Check for normal symbol wins
        for (const symbol of SYMBOLS.filter(s => s !== GameConfig.SCATTER_SYMBOL)) {
            let positions = this.getSymbolPositions(grid, symbol);
            const numWilds = wildPositions.length;
            const effectiveCount = positions.length + numWilds;

            if (effectiveCount >= GameConfig.MIN_SYMBOLS_FOR_WIN) {
                const winAmount = (PAYTABLE[symbol] || 0) * effectiveCount;
                paylines.push({ symbol, count: effectiveCount, winAmount, positions: [...positions, ...wildPositions], isScatter: false });
            }
        }

        // Mark winning symbols for cascade
        for (const line of paylines) {
            for (const pos of line.positions) {
                if (gridAfterWin[pos] !== GameConfig.WILD_SYMBOL) { // Don't remove wild on normal wins
                    gridAfterWin[pos] = -1; // -1 marks for removal
                }
            }
        }
        return { paylines, gridAfterWin };
    }

    /** Checks for scatter symbols to trigger the bonus round. */
    private checkForBonusTrigger(grid: number[]): number {
        const scatterCount = this.getSymbolPositions(grid, GameConfig.SCATTER_SYMBOL).length;
        return GameConfig.SPINS_PER_SCATTER[scatterCount] || 0;
    }

    /** Removes winning symbols and replaces them with new ones from above. */
    private handleCascade(grid: number[], gridAfterWin: number[], nonce: number): number[] {
        const symbolsToKeep = gridAfterWin.filter(symbol => symbol !== -1);
        const numNewSymbols = GameConfig.GRID_SIZE - symbolsToKeep.length;
        const newSymbols = Array(numNewSymbols).fill(0).map((_, i) => this.generateRandomSymbol(nonce + i));
        return [...newSymbols, ...symbolsToKeep];
    }

    /** Simple check if there are any wins on the board (to continue cascades). */
    private hasWins(grid: number[]): boolean {
        const { paylines } = this.calculateWins(grid);
        return paylines.length > 0;
    }
    
    // =================================================================================
    // --- Utility Helpers ---
    // =================================================================================

    private getSymbolPositions(grid: number[], symbol: number): number[] {
        return grid.reduce((acc, currentSymbol, index) => {
            if (currentSymbol === symbol) {
                acc.push(index);
            }
            return acc;
        }, [] as number[]);
    }

    private generateRandomSymbol(nonce: number): number {
        const symbolsToUse = SYMBOLS.filter(s => s !== GameConfig.SCATTER_SYMBOL && s !== GameConfig.WILD_SYMBOL);
        const hmac = crypto.createHmac('sha256', this.serverSeed);
        hmac.update(`random-symbol-${this.clientSeed}-${nonce}`);
        const hash = hmac.digest();
        return symbolsToUse[hash[0] % symbolsToUse.length];
    }
    
    private getAdjacentPositions(pos: number): number[] {
        const adjacent = [];
        const { x, y } = { x: pos % GameConfig.GRID_WIDTH, y: Math.floor(pos / GameConfig.GRID_WIDTH) };

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < GameConfig.GRID_WIDTH && ny >= 0 && ny < GameConfig.GRID_HEIGHT) {
                    adjacent.push(ny * GameConfig.GRID_WIDTH + nx);
                }
            }
        }
        return adjacent;
    }
}
