
import * as crypto from 'crypto';

// =================================================================================
// --- MODEL DEFINITIONS ---
// =================================================================================

export interface Symbol { id: string; uuid: string; }
export interface IceBlocker extends Symbol { id: 'ice_blocker'; hp: number; }
export interface WalkingWild extends Symbol { id: 'wild_sous_chef'; row: number; col: number; multiplier: number; }
export type Grid = (Symbol | IceBlocker | null)[][];

export interface GameState {
    userId: string; balance: number; currentGrid: Grid; isInBonusMode: boolean; remainingFreeSpins: number;
    totalBonusWin: number; roundWin: number; activeRows: number; reelsHaveExpandedThisSpin: boolean;
    spatulaUsedThisSpin: boolean; requestBonusBuy: boolean; spinInProgress: boolean;
}

export interface Payline { symbolId: string; count: number; positions: { row: number; col: number }[]; winAmount: number; }

export type RoundEvent = | { type: 'SPIN_START'; grid: Grid } | { type: 'WIN'; paylines: Payline[]; currentRoundWin: number }
    | { type: 'CASCADE'; clearedPositions: { row: number; col: number }[] } | { type: 'REFILL'; newGrid: Grid }
    | { type: 'WILD_MOVE'; moves: { from: { row: number; col: number }; to: { row: number; col: number } }[], newGrid: Grid }
    | { type: 'ICE_BREAK'; breaks: {pos: {row: number, col: number}, newHp: number}[] } | { type: 'REEL_EXPAND'; newGrid: Grid }
    | { type: 'SPATULA_TRANSFORM'; fromSymbol: string; toSymbol: string; positions: {row: number, col: number}[]}
    | { type: 'REEL_6_ACTIVATION'; winningPayline: Payline, winAmount: number } | { type: 'SCATTER_LAND'; positions: {row: number, col: number}[] }
    | { type: 'BONUS_TRIGGERED', spinCount: number; } | { type: 'BONUS_SUMMARY', totalBonusWin: number; }
    | { type: 'ROUND_END', finalGrid: Grid; finalRoundWin: number; balance: number };

export interface SpinResult { newState: GameState; eventSequence: RoundEvent[]; }

// =================================================================================
// --- CONFIGURATION CONSTANTS ---
// =================================================================================

const BASE_ROWS = 3; const COLS = 6; const ICE_ROWS = 1; const MAX_ROWS = BASE_ROWS + ICE_ROWS;
const ICE_BLOCKER_HP = 3; const BASE_BET_COST = 10; export const BONUS_BUY_COST = 1000;
const INGREDIENT_SYMBOLS = ['tomato', 'onion', 'bread', 'beef', 'cheese'];
const SCATTER_REEL_CHANCE = 0.20; const WILD_SPAWN_CHANCE = 0.15;
const PAYTABLE: { [key: string]: { [count: number]: number } } = { 'cheese':{3:10,4:25,5:100},'beef':{3:8,4:20,5:80},'bread':{3:6,4:15,5:60},'onion':{3:4,4:10,5:40},'tomato':{3:2,4:5,5:20} };
const PAYLINE_PATHS = [ [0,0,0,0,0], [1,1,1,1,1], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2], [0,1,0,1,0], [1,0,1,0,1], [1,2,1,2,1], [2,1,2,1,2], [0,1,1,1,0], [2,1,1,1,2], [0,0,1,2,2], [2,2,1,0,0], [1,0,0,0,1], [1,2,2,2,1], [0,1,2,2,2], [2,1,0,0,0] ];
const REEL6_MODIFIERS = [ {id:'x500',weight:1},{id:'x100',weight:2},{id:'x10',weight:10},{id:'x2',weight:20},{id:'golden_spatula',weight:16},{id:'86d',weight:61} ];
const REEL6_TOTAL_WEIGHT = REEL6_MODIFIERS.reduce((sum, mod) => sum + mod.weight, 0);
const SPINS_PER_SCATTER: { [key: number]: number } = { 3: 10, 4: 15, 5: 20 };

// =================================================================================
// --- CORE LOGIC: GameEngine Class (STATEFUL & COMPLETE) ---
// =================================================================================

export class GameEngine {
    private serverSeed: string; private clientSeed: string; private nonce: number; private roundNonce: number = 0;

    constructor(serverSeed: string, clientSeed: string, nonce: number) {
        this.serverSeed = serverSeed; this.clientSeed = clientSeed; this.nonce = nonce;
    }

    public static getInitialState(userId: string = 'player1'): GameState {
        return {
            userId, balance: 10000, currentGrid: Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null)),
            isInBonusMode: false, remainingFreeSpins: 0, totalBonusWin: 0, roundWin: 0, activeRows: BASE_ROWS,
            reelsHaveExpandedThisSpin: false, spatulaUsedThisSpin: false, requestBonusBuy: false, spinInProgress: false
        };
    }

    public processSpin(currentState: GameState): SpinResult {
        const eventSequence: RoundEvent[] = [];
        let newState: GameState = JSON.parse(JSON.stringify(currentState));
        const existingWins = this._evaluateWins(newState.currentGrid, newState.activeRows);
        if (existingWins.length > 0) return this._performCascadeAndRefill(newState, existingWins, eventSequence);
        if (this._countWilds(newState.currentGrid) > 0) return this._performWildRespin(newState, eventSequence);
        if (newState.spinInProgress) this._summarizeRoundAndTriggerBonus(newState, eventSequence);
        if (newState.isInBonusMode && newState.remainingFreeSpins > 0) return this._performFreeSpin(newState, eventSequence);
        if (newState.isInBonusMode) this._endBonusMode(newState, eventSequence);
        return this._performPaidSpin(newState, eventSequence);
    }

    private _performPaidSpin(state: GameState, events: RoundEvent[]): SpinResult {
        if (state.balance < BASE_BET_COST && !state.requestBonusBuy) throw new Error("Insufficient balance");
        const isBonusBuy = state.requestBonusBuy; if(isBonusBuy) state.requestBonusBuy = false; else state.balance -= BASE_BET_COST;
        state = this._resetForNewSpin(state); state.currentGrid = this._generateInitialGrid(isBonusBuy); state.spinInProgress = true;
        this._handleSpatulaTransform(state, events); events.unshift({ type: 'SPIN_START', grid: state.currentGrid });
        return { newState: state, eventSequence: events };
    }

    private _performFreeSpin(state: GameState, events: RoundEvent[]): SpinResult {
        state.remainingFreeSpins--; state = this._resetForNewSpin(state); state.currentGrid = this._generateInitialGrid(false); state.spinInProgress = true;
        this._handleSpatulaTransform(state, events); events.unshift({ type: 'SPIN_START', grid: state.currentGrid });
        return { newState: state, eventSequence: events };
    }

    private _performCascadeAndRefill(state: GameState, paylines: Payline[], events: RoundEvent[]): SpinResult {
        const { newPaylines, event } = this._applyReel6Multiplier(state.currentGrid, paylines); if(event) { paylines = newPaylines; events.push(event); }
        const currentWin = paylines.reduce((sum, p) => sum + p.winAmount, 0); state.roundWin += currentWin; if(state.isInBonusMode) state.totalBonusWin += currentWin;
        events.push({ type: 'WIN', paylines, currentRoundWin: state.roundWin });
        const { clearedPositions, iceBreakEvents } = this._performCascade(state.currentGrid, paylines); events.push({ type: 'CASCADE', clearedPositions });
        if (iceBreakEvents.length > 0) {
            events.push({ type: 'ICE_BREAK', breaks: iceBreakEvents });
            if (!state.reelsHaveExpandedThisSpin && iceBreakEvents.some(e => e.newHp <= 0)) {
                state.reelsHaveExpandedThisSpin = true; state.activeRows = MAX_ROWS;
                for(let r=0; r < MAX_ROWS; r++) for(let c=0; c < COLS-1; c++) if(state.currentGrid[r][c]?.id === 'ice_blocker') state.currentGrid[r][c] = null;
                events.push({ type: 'REEL_EXPAND', newGrid: state.currentGrid });
            }
        }
        this._performGravity(state.currentGrid); this._refillEmpty(state.currentGrid); events.push({ type: 'REFILL', newGrid: state.currentGrid });
        return { newState: state, eventSequence: events };
    }

    private _performWildRespin(state: GameState, events: RoundEvent[]): SpinResult {
        const { moves } = this._moveWilds(state.currentGrid);
        if (moves.length > 0) {
            events.push({ type: 'WILD_MOVE', moves, newGrid: state.currentGrid }); this._performGravity(state.currentGrid);
            this._refillEmpty(state.currentGrid); events.push({ type: 'REFILL', newGrid: state.currentGrid });
        } return { newState: state, eventSequence: events };
    }

    private _summarizeRoundAndTriggerBonus(state: GameState, events: RoundEvent[]) {
        state.balance += state.roundWin; events.push({ type: 'ROUND_END', finalGrid: state.currentGrid, finalRoundWin: state.roundWin, balance: state.balance });
        const scatterPositions = this._getScatterPositions(state.currentGrid);
        if (scatterPositions.length >= 2) events.push({type: 'SCATTER_LAND', positions: scatterPositions});
        if (!state.isInBonusMode && scatterPositions.length >= 3) {
            state.isInBonusMode = true; state.remainingFreeSpins = SPINS_PER_SCATTER[scatterPositions.length] || SPINS_PER_SCATTER[5];
            state.totalBonusWin = state.roundWin; events.push({ type: 'BONUS_TRIGGERED', spinCount: state.remainingFreeSpins });
        }
        state.spinInProgress = false;
    }

    private _endBonusMode(state: GameState, events: RoundEvent[]) {
        events.push({ type: 'BONUS_SUMMARY', totalBonusWin: state.totalBonusWin }); state.isInBonusMode = false; state.totalBonusWin = 0;
    }

    private _resetForNewSpin(state: GameState): GameState {
        state.roundWin = 0; state.reelsHaveExpandedThisSpin = false; state.spatulaUsedThisSpin = false; state.activeRows = BASE_ROWS;
        return state;
    }

    private _nextRandom(): number { this.roundNonce++; const hmac = crypto.createHmac('sha256', this.serverSeed); hmac.update(`${this.clientSeed}-${this.nonce}-${this.roundNonce}`); return parseInt(hmac.digest('hex').substring(0, 13), 16) / Math.pow(2, 52); }
    private _createSymbol(id: string): Symbol { return { id, uuid: crypto.randomBytes(16).toString('hex') }; }
    private _createIceBlocker(): IceBlocker { return { id: 'ice_blocker', uuid: crypto.randomBytes(16).toString('hex'), hp: ICE_BLOCKER_HP }; }
    private _createWalkingWild(row: number, col: number): WalkingWild { return { id: 'wild_sous_chef', uuid: crypto.randomBytes(16).toString('hex'), row, col, multiplier: 1 }; }
    private _countWilds(grid: Grid): number { return grid.flat().filter(s => s?.id === 'wild_sous_chef').length; }
    private _getScatterPositions(grid: Grid): {row: number, col: number}[] { const pos: {row:number, col:number}[] = []; for(let r=0; r<MAX_ROWS; r++) for(let c=0; c<COLS-1; c++) if(grid[r][c]?.id === 'scatter_hat') pos.push({row:r, col:c}); return pos; }

    private _generateInitialGrid(isBonusBuy: boolean): Grid { 
        const grid: Grid = Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null));
        for (let col = 0; col < COLS - 1; col++) for (let row = 0; row < ICE_ROWS; row++) grid[row][col] = this._createIceBlocker();
        if (isBonusBuy) {
            const scatterCols = [0, 2, 4];
            for (const col of scatterCols) grid[ICE_ROWS + Math.floor(this._nextRandom() * BASE_ROWS)][col] = this._createSymbol('scatter_hat');
        }
        for (let col = 0; col < COLS - 1; col++) {
            for (let row = ICE_ROWS; row < MAX_ROWS; row++) {
                if (grid[row][col] === null) {
                    if (!isBonusBuy && this._nextRandom() < SCATTER_REEL_CHANCE) grid[row][col] = this._createSymbol('scatter_hat');
                    else if (this._nextRandom() < WILD_SPAWN_CHANCE) grid[row][col] = this._createWalkingWild(row, col);
                    else grid[row][col] = this._createSymbol(INGREDIENT_SYMBOLS[Math.floor(this._nextRandom() * INGREDIENT_SYMBOLS.length)]);
                }
            }
        }
        const rand = this._nextRandom() * REEL6_TOTAL_WEIGHT; let cumulativeWeight = 0; let reel6SymbolId = '86d';
        for (const mod of REEL6_MODIFIERS) { if (rand < (cumulativeWeight += mod.weight)) { reel6SymbolId = mod.id; break; } }
        const reel6Symbol = this._createSymbol(reel6SymbolId);
        for (let row = ICE_ROWS; row < MAX_ROWS; row++) grid[row][COLS - 1] = reel6Symbol;
        return grid;
    }
    
    private _evaluateWins(grid: Grid, activeRows: number): Payline[] {
        const paylines: Payline[] = [];
        for (const path of PAYLINE_PATHS) {
            const firstSymbol = grid[path[0] + (MAX_ROWS - activeRows)][0];
            if (!firstSymbol || !PAYTABLE[firstSymbol.id]) continue;
            let count = 1; let positions = [{ row: path[0] + (MAX_ROWS - activeRows), col: 0 }];
            for (let col = 1; col < COLS - 1; col++) {
                const symbolOnPath = grid[path[col] + (MAX_ROWS - activeRows)][col];
                if (symbolOnPath?.id === firstSymbol.id) {
                    count++; positions.push({ row: path[col] + (MAX_ROWS - activeRows), col: col });
                } else break;
            }
            if (PAYTABLE[firstSymbol.id][count]) {
                paylines.push({ symbolId: firstSymbol.id, count, positions, winAmount: PAYTABLE[firstSymbol.id][count] });
            }
        }
        return paylines;
    }
    
    private _handleSpatulaTransform(state: GameState, events: RoundEvent[]) {
        const reel6Id = state.currentGrid[ICE_ROWS][COLS - 1]?.id;
        if (reel6Id === 'golden_spatula' && !state.spatulaUsedThisSpin) {
            const fromSymbol = INGREDIENT_SYMBOLS[Math.floor(this._nextRandom() * INGREDIENT_SYMBOLS.length)];
            const toSymbol = INGREDIENT_SYMBOLS[Math.floor(this._nextRandom() * INGREDIENT_SYMBOLS.length)];
            const positions: {row:number, col:number}[] = [];
            for (let r = 0; r < MAX_ROWS; r++) for (let c = 0; c < COLS - 1; c++) if (state.currentGrid[r][c]?.id === fromSymbol) positions.push({row:r,col:c});
            if (positions.length > 0) {
                positions.forEach(p => state.currentGrid[p.row][p.col] = this._createSymbol(toSymbol));
                events.push({ type: 'SPATULA_TRANSFORM', fromSymbol, toSymbol, positions });
                state.spatulaUsedThisSpin = true;
            }
        }
    }

    private _applyReel6Multiplier(grid: Grid, paylines: Payline[]): { newPaylines: Payline[], event: RoundEvent | null } {
        const reel6Id = grid[ICE_ROWS][COLS - 1]?.id;
        if (reel6Id?.startsWith('x')) {
            const multiplier = parseInt(reel6Id.substring(1));
            const highestPayline = paylines.reduce((max, p) => p.winAmount > max.winAmount ? p : max, paylines[0]);
            highestPayline.winAmount *= multiplier;
            const event: RoundEvent = { type: 'REEL_6_ACTIVATION', winningPayline: highestPayline, winAmount: highestPayline.winAmount };
            return { newPaylines: paylines, event };
        }
        return { newPaylines: paylines, event: null };
    }

    private _performCascade(grid: Grid, paylines: Payline[]): { clearedPositions: {row:number, col:number}[], iceBreakEvents: {pos: {row:number, col:number}, newHp: number}[] } {
        const clearedPositions = [...new Set(paylines.flatMap(p => p.positions))];
        const iceBreakEvents: {pos: {row:number, col:number}, newHp: number}[] = [];
        clearedPositions.forEach(pos => {
            for (let r = Math.max(0, pos.row-1); r <= Math.min(MAX_ROWS-1, pos.row+1); r++) {
                for (let c = Math.max(0, pos.col-1); c <= Math.min(COLS-2, pos.col+1); c++) {
                    const cell = grid[r][c];
                    if (cell?.id === 'ice_blocker') {
                        (cell as IceBlocker).hp--;
                        iceBreakEvents.push({ pos: {row:r, col:c}, newHp: (cell as IceBlocker).hp });
                    }
                }
            }
        });
        clearedPositions.forEach(p => grid[p.row][p.col] = null);
        return { clearedPositions, iceBreakEvents };
    }

    private _performGravity(grid: Grid): void {
        for (let c = 0; c < COLS - 1; c++) {
            for (let r = MAX_ROWS - 1; r > 0; r--) {
                if (grid[r][c] === null) {
                    let swapRow = r - 1;
                    while(swapRow >= 0 && grid[swapRow][c] === null) swapRow--;
                    if(swapRow >= 0) {
                        grid[r][c] = grid[swapRow][c];
                        grid[swapRow][c] = null;
                    }
                }
            }
        }
    }

    private _refillEmpty(grid: Grid): void {
        for (let c = 0; c < COLS - 1; c++) for (let r = 0; r < MAX_ROWS; r++) {
            if(grid[r][c] === null) grid[r][c] = this._createSymbol(INGREDIENT_SYMBOLS[Math.floor(this._nextRandom() * INGREDIENT_SYMBOLS.length)]);
        }
    }

    private _moveWilds(grid: Grid): { moves: {from:any, to:any}[] } {
        const moves: { from: { row: number; col: number }; to: { row: number; col: number } }[] = [];
        for (let r = 0; r < MAX_ROWS; r++) for (let c = 0; c < COLS - 1; c++) {
            const cell = grid[r][c];
            if (cell?.id === 'wild_sous_chef') {
                const wild = cell as WalkingWild;
                const from = {row: r, col: c};
                let to = {row: r, col: c - 1};
                if(c > 0 && grid[r][c-1] === null) {
                    grid[r][c-1] = wild;
                    grid[r][c] = null;
                } else { to = from; }
                moves.push({ from, to });
            }
        }
        return { moves };
    }
}
