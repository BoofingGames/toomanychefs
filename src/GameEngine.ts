
import * as crypto from 'crypto';

// --- TYPE DEFINITIONS AND INTERFACES (Corrected) ---
export interface Symbol { id: string; uuid: string; }
export interface WalkingWild extends Symbol { id: 'wild_sous_chef'; row: number; col: number; }
export interface Payline { symbolId: string; count: number; positions: { row: number; col: number }[]; winAmount: number; }

// Corrected Grid type to allow for nulls during cascades
export type Grid = (Symbol | null)[][];

export type RoundEvent =
    | { type: 'INITIAL_SPIN'; grid: Grid }
    | { type: 'WIN'; paylines: Payline[]; totalWin: number }
    | { type: 'CASCADE'; clearedPositions: { row: number; col: number }[] }
    | { type: 'REFILL'; newGrid: Grid }
    | { type: 'WILD_SPAWN'; wilds: WalkingWild[] }
    | { type: 'WILD_MOVE'; moves: { from: { row: number; col: number }; to: { row: number; col: number } }[] }
    | { type: 'KITCHEN_CHAOS_COLLISION'; outcome: 'BUST' | 'MERGE'; position: { row: number; col: number }; resultingGrid: Grid }
    | { type: 'REEL_6_ACTIVATION'; multiplier: number; winningPayline: Payline }
    | { type: 'ROUND_SUMMARY'; finalGrid: Grid; totalWin: number };

export interface SpinResult { finalTotalWin: number; finalGrid: Grid; eventSequence: RoundEvent[]; bonusTriggered: boolean; }

// --- CONFIGURATION ---
const ROWS = 3;
const COLS = 6;
const INGREDIENT_SYMBOLS = ['tomato', 'onion', 'beef', 'bread', 'cheese'];
const PAYTABLE: { [key: string]: { [count: number]: number } } = {
    'cheese': { 3: 10, 4: 25, 5: 100 },
    'beef': { 3: 8, 4: 20, 5: 80 },
    'bread': { 3: 6, 4: 15, 5: 60 },
    'onion': { 3: 4, 4: 10, 5: 40 },
    'tomato': { 3: 2, 4: 5, 5: 20 },
};
const PAYLINE_PATHS = [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2]];
const REEL6_MODIFIERS = [{ id: 'x500', weight: 1 }, { id: 'x100', weight: 1 }, { id: 'x10', weight: 8 }, { id: 'x2', weight: 40 }, { id: '86d', weight: 950 }];
const REEL6_TOTAL_WEIGHT = REEL6_MODIFIERS.reduce((sum, mod) => sum + mod.weight, 0);
export const BONUS_SPINS_AWARDED = 10;

// --- CORE LOGIC ---
export class GameEngine {
    private serverSeed: string;
    private clientSeed: string;
    private nonce: number;
    private roundNonce: number = 0;

    constructor(serverSeed: string, clientSeed: string, nonce: number) {
        this.serverSeed = serverSeed;
        this.clientSeed = clientSeed;
        this.nonce = nonce;
    }

    private nextRandom(): number {
        this.roundNonce++;
        const hmac = crypto.createHmac('sha256', this.serverSeed);
        hmac.update(`'''${this.clientSeed}'''-'''${this.nonce}'''-'''${this.roundNonce}'''`);
        return parseInt(hmac.digest('hex').substring(0, 13), 16) / Math.pow(2, 52);
    }

    private createSymbol(id: string): Symbol { return { id, uuid: crypto.randomUUID() }; }

    private generateInitialGrid(): Grid {
        const grid: Grid = Array.from({ length: ROWS }, () => []);
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS - 1; col++) {
                grid[row][col] = this.createSymbol(INGREDIENT_SYMBOLS[Math.floor(this.nextRandom() * INGREDIENT_SYMBOLS.length)]);
            }
        }
        const rand = this.nextRandom() * REEL6_TOTAL_WEIGHT;
        let cumulativeWeight = 0;
        let reel6SymbolId = '86d';
        for (const mod of REEL6_MODIFIERS) {
            if (rand < (cumulativeWeight += mod.weight)) { reel6SymbolId = mod.id; break; }
        }
        const reel6Symbol = this.createSymbol(reel6SymbolId);
        for (let row = 0; row < ROWS; row++) { grid[row][COLS - 1] = reel6Symbol; }
        return grid;
    }

    private evaluateWins(grid: Grid): Payline[] {
        const wins: Payline[] = [];
        for (const path of PAYLINE_PATHS) {
            const lineSymbols: { symbol: Symbol, pos: { row: number, col: number } }[] = [];
            for(let col = 0; col < COLS - 1; col++) {
                const symbol = grid[path[col]][col];
                if (symbol) { lineSymbols.push({ symbol, pos: { row: path[col], col } }); }
            }
            if (lineSymbols.length === 0) continue;

            const firstSymbol = lineSymbols[0].symbol;
            if (firstSymbol.id === 'wild_sous_chef') continue;

            let count = 1;
            const positions = [lineSymbols[0].pos];
            for (let i = 1; i < lineSymbols.length; i++) {
                const currentSymbol = lineSymbols[i].symbol;
                if (currentSymbol.id === firstSymbol.id || currentSymbol.id === 'wild_sous_chef') {
                    count++;
                    positions.push(lineSymbols[i].pos);
                } else { break; }
            }

            if (PAYTABLE[firstSymbol.id]?.[count]) {
                wins.push({ symbolId: firstSymbol.id, count, positions, winAmount: PAYTABLE[firstSymbol.id][count] });
            }
        }
        return wins;
    }
    
    private evaluateReel6(paylines: Payline[], grid: Grid): { multiplier: number, payline?: Payline } {
        const fiveOfAKindPayline = paylines.find(p => p.count === 5 && p.positions.every(pos => grid[pos.row][pos.col]?.id !== 'wild_sous_chef'));
        if (!fiveOfAKindPayline) return { multiplier: 1 };

        const reel6Id = grid[0][COLS - 1]?.id;
        if (!reel6Id) return { multiplier: 1 };

        const multiplier = parseInt(reel6Id.replace('x', ''));
        return isNaN(multiplier) ? { multiplier: 1 } : { multiplier, payline: fiveOfAKindPayline };
    }

    private performCascade(grid: Grid, paylines: Payline[]): { newGrid: Grid, clearedPositions: {row: number, col: number}[] } {
        let newGrid = grid.map(row => [...row]);
        const clearedPositions = [...new Set(paylines.flatMap(p => p.positions))];
        clearedPositions.forEach(pos => { newGrid[pos.row][pos.col] = null; });
        return { newGrid, clearedPositions };
    }

    private refillGrid(grid: Grid): Grid {
        let newGrid = grid.map(row => [...row]);
        for (let col = 0; col < COLS -1; col++) {
            for (let row = ROWS - 1; row >= 0; row--) {
                if (newGrid[row][col] === null) {
                    for (let r = row - 1; r >= 0; r--) {
                        if (newGrid[r][col] !== null) {
                            newGrid[row][col] = newGrid[r][col];
                            newGrid[r][col] = null;
                            break;
                        }
                    }
                }
                if (newGrid[row][col] === null) {
                    newGrid[row][col] = this.createSymbol(INGREDIENT_SYMBOLS[Math.floor(this.nextRandom() * INGREDIENT_SYMBOLS.length)]);
                }
            }
        }
        return newGrid;
    }

    private moveAndCollideWilds(grid: Grid): { gridAfterWilds: Grid, chaosEvent?: RoundEvent, moves: any[] } {
        return { gridAfterWilds: grid, moves: [] };
    }

    public resolveSpin(): SpinResult {
        const eventSequence: RoundEvent[] = [];
        let currentGrid = this.generateInitialGrid();
        eventSequence.push({ type: 'INITIAL_SPIN', grid: currentGrid });

        let totalWin = 0;
        let isCascading = true;

        while (isCascading) {
            const paylines = this.evaluateWins(currentGrid);
            if (paylines.length > 0) {
                let currentCycleWin = paylines.reduce((sum, p) => sum + p.winAmount, 0);
                eventSequence.push({ type: 'WIN', paylines, totalWin: currentCycleWin });
                
                const { multiplier, payline: activatingPayline } = this.evaluateReel6(paylines, currentGrid);
                if (multiplier > 1 && activatingPayline) {
                    currentCycleWin *= multiplier;
                    eventSequence.push({ type: 'REEL_6_ACTIVATION', multiplier, winningPayline: activatingPayline });
                }
                totalWin += currentCycleWin;

                const { newGrid, clearedPositions } = this.performCascade(currentGrid, paylines);
                currentGrid = newGrid;
                eventSequence.push({ type: 'CASCADE', clearedPositions });

                const { gridAfterWilds, chaosEvent, moves } = this.moveAndCollideWilds(currentGrid);
                currentGrid = gridAfterWilds;
                if(moves.length > 0) eventSequence.push({ type: 'WILD_MOVE', moves });
                if (chaosEvent && chaosEvent.type === 'KITCHEN_CHAOS_COLLISION' && chaosEvent.outcome === 'BUST') {
                    eventSequence.push(chaosEvent);
                    totalWin = 0; 
                    break;
                }

                currentGrid = this.refillGrid(currentGrid);
                eventSequence.push({ type: 'REFILL', newGrid: currentGrid });
            } else {
                isCascading = false;
            }
        }

        eventSequence.push({ type: 'ROUND_SUMMARY', finalGrid: currentGrid, totalWin });

        return { finalTotalWin: totalWin, finalGrid: currentGrid, eventSequence, bonusTriggered: false };
    }
}
