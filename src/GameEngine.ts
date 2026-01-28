
import * as crypto from 'crypto';

// =================================================================================
// --- STATEFUL MODEL DEFINITIONS ---
// =================================================================================

export interface Symbol { id: string; uuid: string; }
export interface IceBlocker extends Symbol { id: 'ice_blocker'; hp: number; }
export interface WalkingWild extends Symbol { id: 'wild_sous_chef'; row: number; col: number; multiplier: number; }
export type Grid = (Symbol | IceBlocker | null)[][];

export interface GameState {
    userId: string;
    balance: number;
    currentGrid: Grid;
    isInBonusMode: boolean;
    remainingFreeSpins: number;
    totalBonusWin: number;
    roundWin: number;
    activeRows: number;
    reelsHaveExpandedThisSpin: boolean;
    spatulaUsedThisSpin: boolean;
    requestBonusBuy: boolean;
    spinInProgress: boolean; // Is there an active spin sequence (cascades, respins)?
}

export interface Payline { symbolId: string; count: number; positions: { row: number; col: number }[]; winAmount: number; }

// --- Event Types for Frontend Animation ---
export type RoundEvent =
    | { type: 'SPIN_START', grid: Grid }
    | { type: 'WIN', paylines: Payline[]; currentRoundWin: number }
    | { type: 'CASCADE', clearedPositions: { row: number; col: number }[] }
    | { type: 'REFILL', newGrid: Grid }
    | { type: 'WILD_MOVE', moves: { from: { row: number; col: number }; to: { row: number; col: number } }[], newGrid: Grid }
    | { type: 'ICE_BREAK', breaks: {pos: {row: number, col: number}, newHp: number}[] }
    | { type: 'REEL_EXPAND', newGrid: Grid }
    | { type: 'SPATULA_TRANSFORM'; fromSymbol: string; toSymbol: string; positions: {row: number, col: number}[]}
    | { type: 'REEL_6_ACTIVATION', winningPayline: Payline, winAmount: number }
    | { type: 'SCATTER_LAND', positions: {row: number, col: number}[] }
    | { type: 'BONUS_TRIGGERED', spinCount: number; }
    | { type: 'BONUS_SUMMARY', totalBonusWin: number; }
    | { type: 'ROUND_END', finalGrid: Grid; finalRoundWin: number; balance: number };

// --- Return value for the stateful spin processor ---
export interface SpinResult {
    newState: GameState;
    eventSequence: RoundEvent[];
}

// =================================================================================
// --- CONFIGURATION CONSTANTS ---
// =================================================================================

const BASE_ROWS = 3;
const COLS = 6;
const ICE_ROWS = 1;
const MAX_ROWS = BASE_ROWS + ICE_ROWS;
const ICE_BLOCKER_HP = 3;
const BASE_BET_COST = 10;
export const BONUS_BUY_COST = 1000; // 100x the base bet

const INGREDIENT_SYMBOLS = ['tomato', 'onion', 'bread', 'beef', 'cheese']; // Ordered by value
const SCATTER_REEL_CHANCE = 0.20;
const WILD_SPAWN_CHANCE = 0.15;
const PAYTABLE: { [key: string]: { [count: number]: number } } = { 'cheese':{3:10,4:25,5:100},'beef':{3:8,4:20,5:80},'bread':{3:6,4:15,5:60},'onion':{3:4,4:10,5:40},'tomato':{3:2,4:5,5:20} };
const PAYLINE_PATHS = [ [0,0,0,0,0], [1,1,1,1,1], [2,2,2,2,2], [0,1,2,1,0], [2,1,0,1,2], [0,1,0,1,0], [1,0,1,0,1], [1,2,1,2,1], [2,1,2,1,2], [0,1,1,1,0], [2,1,1,1,2], [0,0,1,2,2], [2,2,1,0,0], [1,0,0,0,1], [1,2,2,2,1], [0,1,2,2,2], [2,1,0,0,0] ];
const REEL6_MODIFIERS = [ {id:'x500',weight:1},{id:'x100',weight:2},{id:'x10',weight:10},{id:'x2',weight:20},{id:'golden_spatula',weight:16},{id:'86d',weight:61} ];
const REEL6_TOTAL_WEIGHT = REEL6_MODIFIERS.reduce((sum, mod) => sum + mod.weight, 0);
const SPINS_PER_SCATTER: { [key: number]: number } = { 3: 10, 4: 15, 5: 20 };

// =================================================================================
// --- CORE LOGIC: GameEngine Class (STATEFUL) ---
// =================================================================================

export class GameEngine {
    private serverSeed: string; private clientSeed: string; private nonce: number; private roundNonce: number = 0;

    constructor(serverSeed: string, clientSeed: string, nonce: number) {
        this.serverSeed = serverSeed; this.clientSeed = clientSeed; this.nonce = nonce;
    }

    /** Returns a fresh game state for a new player. */
    public static getInitialState(userId: string = 'player1'): GameState {
        return {
            userId,
            balance: 10000,
            currentGrid: Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null)),
            isInBonusMode: false,
            remainingFreeSpins: 0,
            totalBonusWin: 0,
            roundWin: 0,
            activeRows: BASE_ROWS,
            reelsHaveExpandedThisSpin: false,
            spatulaUsedThisSpin: false,
            requestBonusBuy: false,
            spinInProgress: false,
        };
    }

    /** The main stateful processing function. Determines the next single action and executes it. */
    public processSpin(currentState: GameState): SpinResult {
        const eventSequence: RoundEvent[] = [];
        let newState: GameState = JSON.parse(JSON.stringify(currentState)); // Deep copy

        // --- Action Determination Phase ---
        const existingWins = this._evaluateWins(newState.currentGrid, newState.activeRows);

        // 1. Is there a cascade to resolve from a previous action?
        if (existingWins.length > 0) {
            return this._performCascadeAndRefill(newState, existingWins, eventSequence);
        }

        // 2. No cascades. Are there walking wilds to move?
        if (this._countWilds(newState.currentGrid) > 0) {
            return this._performWildRespin(newState, eventSequence);
        }

        // 3. No cascades or wilds. This means a sub-spin (cascade/respin) has ended. 
        // If a spin was in progress, it's now time to finalize it.
        if (newState.spinInProgress) {
            this._summarizeRoundAndTriggerBonus(newState, eventSequence);
        }

        // 4. Round is settled. What's the next primary action?
        // Is it a free spin?
        if (newState.isInBonusMode && newState.remainingFreeSpins > 0) {
            return this._performFreeSpin(newState, eventSequence);
        }

        // 5. Not in a bonus or out of free spins. End bonus mode if it was active.
        if (newState.isInBonusMode) {
            this._endBonusMode(newState, eventSequence);
        }

        // 6. Nothing else to do. Perform a new paid spin.
        return this._performPaidSpin(newState, eventSequence);
    }
    
    // =================================================================================
    // --- PRIVATE: Action Handlers ---
    // =================================================================================

    /** Starts a new paid spin. */
    private _performPaidSpin(state: GameState, events: RoundEvent[]): SpinResult {
        if (state.balance < BASE_BET_COST && !state.requestBonusBuy) {
            throw new Error("Insufficient balance"); // This should be checked at the API level too
        }
        
        const isBonusBuy = state.requestBonusBuy;
        if(isBonusBuy) { state.requestBonusBuy = false; }
        else { state.balance -= BASE_BET_COST; }

        state = this._resetForNewSpin(state);
        state.currentGrid = this._generateInitialGrid(isBonusBuy);
        state.spinInProgress = true;

        this._handleSpatulaTransform(state, events); // Check for spatula on initial grid

        events.unshift({ type: 'SPIN_START', grid: state.currentGrid });
        return { newState: state, eventSequence: events };
    }
    
    /** Starts a new free spin within a bonus round. */
    private _performFreeSpin(state: GameState, events: RoundEvent[]): SpinResult {
        state.remainingFreeSpins--;
        state = this._resetForNewSpin(state);
        state.currentGrid = this._generateInitialGrid(false);
        state.spinInProgress = true;
        
        this._handleSpatulaTransform(state, events);
        
        events.unshift({ type: 'SPIN_START', grid: state.currentGrid });
        return { newState: state, eventSequence: events };
    }
    
    /** Processes wins, cascades, and refills. */
    private _performCascadeAndRefill(state: GameState, paylines: Payline[], events: RoundEvent[]): SpinResult {
        const { newPaylines, event } = this._applyReel6Multiplier(state.currentGrid, paylines);
        if(event) { paylines = newPaylines; events.push(event); }

        const currentWin = paylines.reduce((sum, p) => sum + p.winAmount, 0);
        state.roundWin += currentWin;
        if(state.isInBonusMode) state.totalBonusWin += currentWin;
        events.push({ type: 'WIN', paylines, currentRoundWin: state.roundWin });

        // Perform cascade and damage/break ice
        const { clearedPositions, iceBreakEvents } = this._performCascade(state.currentGrid, paylines);
        events.push({ type: 'CASCADE', clearedPositions });
        if (iceBreakEvents.length > 0) {
            events.push({ type: 'ICE_BREAK', breaks: iceBreakEvents });
            // Check for reel expansion
            if (!state.reelsHaveExpandedThisSpin && iceBreakEvents.some(e => e.newHp <= 0)) {
                state.reelsHaveExpandedThisSpin = true;
                state.activeRows = MAX_ROWS;
                // Remove all ice blockers from the grid state
                for(let r=0; r < MAX_ROWS; r++) { for(let c=0; c < COLS-1; c++) { if(state.currentGrid[r][c]?.id === 'ice_blocker') state.currentGrid[r][c] = null; } }
                events.push({ type: 'REEL_EXPAND', newGrid: state.currentGrid });
            }
        }

        // Apply gravity and refill
        this._performGravity(state.currentGrid);
        this._refillEmpty(state.currentGrid);
        events.push({ type: 'REFILL', newGrid: state.currentGrid });

        return { newState: state, eventSequence: events };
    }

    /** Moves walking wilds one step. */
    private _performWildRespin(state: GameState, events: RoundEvent[]): SpinResult {
        const { moves } = this._moveWilds(state.currentGrid);
        if (moves.length > 0) {
            events.push({ type: 'WILD_MOVE', moves, newGrid: state.currentGrid });
            this._performGravity(state.currentGrid);
            this._refillEmpty(state.currentGrid);
            events.push({ type: 'REFILL', newGrid: state.currentGrid });
        }
        return { newState: state, eventSequence: events };
    }

    /** Finalizes a round, checks for bonus trigger, and updates balance. */
    private _summarizeRoundAndTriggerBonus(state: GameState, events: RoundEvent[]) {
        state.balance += state.roundWin;
        events.push({ type: 'ROUND_END', finalGrid: state.currentGrid, finalRoundWin: state.roundWin, balance: state.balance });

        // Check for bonus trigger only if not already in bonus mode
        const scatterPositions = this._getScatterPositions(state.currentGrid);
        if (scatterPositions.length >= 2) events.push({type: 'SCATTER_LAND', positions: scatterPositions});
        if (!state.isInBonusMode && scatterPositions.length >= 3) {
            state.isInBonusMode = true;
            state.remainingFreeSpins = SPINS_PER_SCATTER[scatterPositions.length] || 0;
            state.totalBonusWin = state.roundWin; // Carry over trigger win
            events.push({ type: 'BONUS_TRIGGERED', spinCount: state.remainingFreeSpins });
        }
        state.spinInProgress = false;
    }

    /** Finalizes a bonus round. */
    private _endBonusMode(state: GameState, events: RoundEvent[]) {
        events.push({ type: 'BONUS_SUMMARY', totalBonusWin: state.totalBonusWin });
        state.isInBonusMode = false;
        state.totalBonusWin = 0;
    }
    
    /** Resets transient state at the start of a new base/free spin. */
    private _resetForNewSpin(state: GameState): GameState {
        state.roundWin = 0;
        state.reelsHaveExpandedThisSpin = false;
        state.spatulaUsedThisSpin = false;
        state.activeRows = BASE_ROWS;
        return state;
    }
    
    // =================================================================================
    // --- PRIVATE: Stateless Helpers (many are unchanged from previous version) ---
    // =================================================================================

    private _generateInitialGrid(isBonusBuy: boolean): Grid { /* ... unchanged ... */ return [[]]; }
    private _evaluateWins(grid: Grid, activeRows: number): Payline[] { /* ... unchanged ... */ return []; }
    private _handleSpatulaTransform(state: GameState, events: RoundEvent[]) { /* ... */ }
    private _applyReel6Multiplier(grid: Grid, paylines: Payline[]): { newPaylines: Payline[], event: RoundEvent | null } { /* ... */ return { newPaylines: paylines, event: null}; }
    private _performCascade(grid: Grid, paylines: Payline[]): { clearedPositions: any[], iceBreakEvents: any[] } { /* ... */ return { clearedPositions: [], iceBreakEvents: [] }; }
    private _performGravity(grid: Grid): Grid { /* ... */ return grid; }
    private _refillEmpty(grid: Grid): Grid { /* ... */ return grid; }
    private _moveWilds(grid: Grid): { moves: any[] } { /* ... */ return { moves: [] }; }
    private _countWilds(grid: Grid): number { return grid.flat().filter(s => s?.id === 'wild_sous_chef').length; }
    private _getScatterPositions(grid: Grid): {row: number, col: number}[] { return []; }
    private nextRandom(): number { this.roundNonce++; const hmac = crypto.createHmac('sha256', this.serverSeed); hmac.update(`${this.clientSeed}-${this.nonce}-${this.roundNonce}`); return parseInt(hmac.digest('hex').substring(0, 13), 16) / Math.pow(2, 52); }
}
