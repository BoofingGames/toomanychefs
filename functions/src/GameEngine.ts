
import * as crypto from 'crypto';

// =================================================================================
// --- PHASE 2: Game Economy & Volatility Model (Iteration 6 - Final Calibration) ---
// =================================================================================

// --- 1. Symbol Definitions (LOCKED) ---
export const SYMBOLS = { '1': { id: '1' }, '2': { id: '2' }, '3': { id: '3' }, '4': { id: '4' }, '5': { id: '5' }, '6': { id: '6' }, '7': { id: '7' }, '8': { id: '8' }, 'W': { id: 'W' }, 'SC': { id: 'SC' } };

// --- 2. Paytable (LOCKED - FINAL BASE GAME) ---
export const PAYTABLE = {
    '1': [0.4, 0.8, 4], '2': [0.4, 0.8, 4], '3': [0.4, 0.8, 4],
    '4': [0.8, 3, 12], '5': [0.8, 3, 12],
    '6': [1.5, 6, 30], '7': [1.5, 6, 30],
    '8': [4, 40, 1500],
};
type PaytableSymbolKey = keyof typeof PAYTABLE;

// --- 3. Reel Strips (LOCKED) ---
const REEL_STRIPS = [
    ['1', '2', '8', '4', '5', '6', '1', '2', '3', 'W', '7', '8', '1', '2', '4', '5'],
    ['1', '2', '3', '4', 'SC', '7', '1', '2', '3', '8', 'W', '6', '1', '2', '4', '5'],
    ['1', '2', '3', '4', '5', '8', '1', '2', 'SC', '6', '7', 'W', '1', '2', '4', '5'],
    ['1', '2', '3', '4', '5', '6', '1', '2', '3', '7', '8', 'SC', 'W', '2', '4', '5'],
    ['1', '2', '3', '4', '5', '7', '1', '2', '3', 'W', '6', '8', '1', '2', '4', '5'],
];

// --- 4. Reel 6 Configurations (FINAL CALIBRATION) ---
const REEL6_SYMBOLS = { 'BLANK': { multiplier: 1 }, '2X': { multiplier: 2 }, '3X': { multiplier: 3 }, '5X': { multiplier: 5 }, '10X': { multiplier: 10 } };
const REEL6_WEIGHTS_BASE = [0.92, 0.05, 0.02, 0.008, 0.002]; // Base Game
const REEL6_WEIGHTS_BONUS = [0.0, 0.60, 0.25, 0.10, 0.05];    // Bonus Game (Final Weights)
type Reel6SymbolKey = keyof typeof REEL6_SYMBOLS;

// --- 5. Paylines & Bonus Config (LOCKED) ---
const PAYLINES = [ [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], ];
const BONUS_TRIGGER_COUNT = 3;
export const BONUS_SPINS_AWARDED = 10;

// =================================================================================
// --- Game Engine Class (Updated for API) ---
// =================================================================================

interface GridPoint { symbolId: string | null; isWild: boolean; }
interface PaylineResult { lineId: number; symbolId: string; count: number; payout: number; positions: { col: number; row: number }[]; }

export class GameEngine {
    private grid: GridPoint[][];
    private prng: () => number;
    private readonly rows = 3;
    private readonly cols = 6;

    constructor(serverSeed: string, clientSeed: string, nonce: number) {
        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(null).map(() => ({ symbolId: null, isWild: false })));
        this.prng = this.createPrng(serverSeed, clientSeed, nonce);
    }

    private createPrng(serverSeed: string, clientSeed: string, nonce: number): () => number {
        const combinedSeed = `${serverSeed}-${clientSeed}-${nonce}`;
        let seed = crypto.createHash('sha256').update(combinedSeed).digest();
        return () => { const hash = crypto.createHash('sha256').update(seed).digest(); seed = hash; return hash.readUInt32BE(0) / (0xFFFFFFFF + 1); };
    }

    public resolveSpin(isBonusSpin: boolean = false) {
        this.populateGrid(isBonusSpin);
        const winningPaylines = this.evaluateWins();
        const reel6Multiplier = this.getReel6Multiplier();
        const totalWin = winningPaylines.reduce((sum, line) => sum + line.payout, 0);
        const finalTotalWin = totalWin * reel6Multiplier;
        const bonusTriggered = !isBonusSpin && this.checkForBonusTrigger();

        return {
            grid: this.grid.map(row => row.map(pt => pt.symbolId)),
            winningPaylines,
            reel6Multiplier,
            finalTotalWin,
            bonusTriggered,
        };
    }

    private populateGrid(isBonusSpin: boolean): void {
        for (let c = 0; c < this.cols - 1; c++) {
            const reel = REEL_STRIPS[c];
            const start = Math.floor(this.prng() * reel.length);
            for (let r = 0; r < this.rows; r++) {
                const symbolId = reel[(start + r) % reel.length];
                this.grid[r][c] = { symbolId, isWild: symbolId === 'W' };
            }
        }
        const reel6Weights = isBonusSpin ? REEL6_WEIGHTS_BONUS : REEL6_WEIGHTS_BASE;
        const reel6SymbolKey = this.getWeightedRandomSymbol(Object.keys(REEL6_SYMBOLS), reel6Weights);
        for (let r = 0; r < this.rows; r++) { this.grid[r][this.cols - 1] = { symbolId: null, isWild: false }; }
        this.grid[1][this.cols - 1] = { symbolId: reel6SymbolKey, isWild: false };
    }

    private evaluateWins(activeLines: number = PAYLINES.length): PaylineResult[] {
        const results: PaylineResult[] = [];
        const linesToCheck = PAYLINES.slice(0, activeLines);
        linesToCheck.forEach((linePath, lineIndex) => {
            let lineSymbolId: string | null = null;
            for (let c = 0; c < linePath.length; c++) {
                const point = this.grid[linePath[c]][c];
                if (point && !point.isWild && point.symbolId !== 'SC') { lineSymbolId = point.symbolId; break; }
            }
            if (!lineSymbolId) { return; }
            let count = 0;
            for (let c = 0; c < linePath.length; c++) {
                const point = this.grid[linePath[c]][c];
                if (point && (point.isWild || point.symbolId === lineSymbolId)) { count++; } else { break; }
            }
            if (count >= 3 && lineSymbolId) {
                const payout = PAYTABLE[lineSymbolId as PaytableSymbolKey]?.[count - 3] || 0;
                if (payout > 0) { 
                    results.push({ 
                        lineId: lineIndex + 1, 
                        symbolId: lineSymbolId, 
                        count, 
                        payout, 
                        positions: linePath.slice(0, count).map((row, col) => ({ col, row })) 
                    }); 
                }
            }
        });
        return results;
    }

    private checkForBonusTrigger(): boolean {
        let scatterCount = 0;
        for (let r = 0; r < this.rows; r++) { for (let c = 0; c < this.cols - 1; c++) { if (this.grid[r][c]?.symbolId === 'SC') { scatterCount++; } } }
        return scatterCount >= BONUS_TRIGGER_COUNT;
    }

    private getReel6Multiplier(): number {
        const symbolId = this.grid[1][this.cols - 1].symbolId;
        return symbolId ? REEL6_SYMBOLS[symbolId as Reel6SymbolKey]?.multiplier ?? 1 : 1;
    }

    private getWeightedRandomSymbol(symbols: string[], weights: number[]): string {
        const rand = this.prng();
        let cumulativeWeight = 0;
        for (let i = 0; i < symbols.length; i++) { cumulativeWeight += weights[i]; if (rand < cumulativeWeight) { return symbols[i]; } }
        return symbols[symbols.length - 1];
    }
}
