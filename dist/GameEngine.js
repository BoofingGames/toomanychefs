"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameEngine = exports.BONUS_BUY_COST = void 0;
const crypto = __importStar(require("crypto"));
// =================================================================================
// --- CONFIGURATION CONSTANTS ---
// =================================================================================
const BASE_ROWS = 3;
const COLS = 6;
const ICE_ROWS = 1;
const MAX_ROWS = BASE_ROWS + ICE_ROWS;
const ICE_BLOCKER_HP = 3;
const BASE_BET_COST = 10;
exports.BONUS_BUY_COST = 1000;
const INGREDIENT_SYMBOLS = ['tomato', 'onion', 'bread', 'beef', 'cheese'];
const SCATTER_REEL_CHANCE = 0.20;
const WILD_SPAWN_CHANCE = 0.15;
const PAYTABLE = { 'cheese': { 3: 10, 4: 25, 5: 100 }, 'beef': { 3: 8, 4: 20, 5: 80 }, 'bread': { 3: 6, 4: 15, 5: 60 }, 'onion': { 3: 4, 4: 10, 5: 40 }, 'tomato': { 3: 2, 4: 5, 5: 20 } };
const PAYLINE_PATHS = [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 1, 0, 1, 0], [1, 0, 1, 0, 1], [1, 2, 1, 2, 1], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 2, 2, 2], [2, 1, 0, 0, 0]];
const REEL6_MODIFIERS = [{ id: 'x500', weight: 1 }, { id: 'x100', weight: 2 }, { id: 'x10', weight: 10 }, { id: 'x2', weight: 20 }, { id: 'golden_spatula', weight: 16 }, { id: '86d', weight: 61 }];
const REEL6_TOTAL_WEIGHT = REEL6_MODIFIERS.reduce((sum, mod) => sum + mod.weight, 0);
const SPINS_PER_SCATTER = { 3: 10, 4: 15, 5: 20 };
// =================================================================================
// --- CORE LOGIC: GameEngine Class (STATEFUL & COMPLETE) ---
// =================================================================================
class GameEngine {
    constructor(serverSeed, clientSeed, nonce) {
        this.roundNonce = 0;
        this.serverSeed = serverSeed;
        this.clientSeed = clientSeed;
        this.nonce = nonce;
    }
    static getInitialState(userId = 'player1') {
        return {
            userId, balance: 10000, currentGrid: Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null)),
            isInBonusMode: false, remainingFreeSpins: 0, totalBonusWin: 0, roundWin: 0, activeRows: BASE_ROWS,
            reelsHaveExpandedThisSpin: false, spatulaUsedThisSpin: false, requestBonusBuy: false, spinInProgress: false
        };
    }
    processSpin(currentState) {
        const eventSequence = [];
        let newState = JSON.parse(JSON.stringify(currentState));
        const existingWins = this._evaluateWins(newState.currentGrid, newState.activeRows);
        if (existingWins.length > 0)
            return this._performCascadeAndRefill(newState, existingWins, eventSequence);
        if (this._countWilds(newState.currentGrid) > 0)
            return this._performWildRespin(newState, eventSequence);
        if (newState.spinInProgress)
            this._summarizeRoundAndTriggerBonus(newState, eventSequence);
        if (newState.isInBonusMode && newState.remainingFreeSpins > 0)
            return this._performFreeSpin(newState, eventSequence);
        if (newState.isInBonusMode)
            this._endBonusMode(newState, eventSequence);
        return this._performPaidSpin(newState, eventSequence);
    }
    _performPaidSpin(state, events) {
        if (state.balance < BASE_BET_COST && !state.requestBonusBuy)
            throw new Error("Insufficient balance");
        const isBonusBuy = state.requestBonusBuy;
        if (isBonusBuy)
            state.requestBonusBuy = false;
        else
            state.balance -= BASE_BET_COST;
        state = this._resetForNewSpin(state);
        state.currentGrid = this._generateInitialGrid(isBonusBuy);
        state.spinInProgress = true;
        this._handleSpatulaTransform(state, events);
        events.unshift({ type: 'SPIN_START', grid: state.currentGrid });
        return { newState: state, eventSequence: events };
    }
    _performFreeSpin(state, events) {
        state.remainingFreeSpins--;
        state = this._resetForNewSpin(state);
        state.currentGrid = this._generateInitialGrid(false);
        state.spinInProgress = true;
        this._handleSpatulaTransform(state, events);
        events.unshift({ type: 'SPIN_START', grid: state.currentGrid });
        return { newState: state, eventSequence: events };
    }
    _performCascadeAndRefill(state, paylines, events) {
        var _a;
        const { newPaylines, event } = this._applyReel6Multiplier(state.currentGrid, paylines);
        if (event) {
            paylines = newPaylines;
            events.push(event);
        }
        const currentWin = paylines.reduce((sum, p) => sum + p.winAmount, 0);
        state.roundWin += currentWin;
        if (state.isInBonusMode)
            state.totalBonusWin += currentWin;
        events.push({ type: 'WIN', paylines, currentRoundWin: state.roundWin });
        const { clearedPositions, iceBreakEvents } = this._performCascade(state.currentGrid, paylines);
        events.push({ type: 'CASCADE', clearedPositions });
        if (iceBreakEvents.length > 0) {
            events.push({ type: 'ICE_BREAK', breaks: iceBreakEvents });
            if (!state.reelsHaveExpandedThisSpin && iceBreakEvents.some(e => e.newHp <= 0)) {
                state.reelsHaveExpandedThisSpin = true;
                state.activeRows = MAX_ROWS;
                for (let r = 0; r < MAX_ROWS; r++)
                    for (let c = 0; c < COLS - 1; c++)
                        if (((_a = state.currentGrid[r][c]) === null || _a === void 0 ? void 0 : _a.id) === 'ice_blocker')
                            state.currentGrid[r][c] = null;
                events.push({ type: 'REEL_EXPAND', newGrid: state.currentGrid });
            }
        }
        this._performGravity(state.currentGrid);
        this._refillEmpty(state.currentGrid);
        events.push({ type: 'REFILL', newGrid: state.currentGrid });
        return { newState: state, eventSequence: events };
    }
    _performWildRespin(state, events) {
        const { moves } = this._moveWilds(state.currentGrid);
        if (moves.length > 0) {
            events.push({ type: 'WILD_MOVE', moves, newGrid: state.currentGrid });
            this._performGravity(state.currentGrid);
            this._refillEmpty(state.currentGrid);
            events.push({ type: 'REFILL', newGrid: state.currentGrid });
        }
        return { newState: state, eventSequence: events };
    }
    _summarizeRoundAndTriggerBonus(state, events) {
        state.balance += state.roundWin;
        events.push({ type: 'ROUND_END', finalGrid: state.currentGrid, finalRoundWin: state.roundWin, balance: state.balance });
        const scatterPositions = this._getScatterPositions(state.currentGrid);
        if (scatterPositions.length >= 2)
            events.push({ type: 'SCATTER_LAND', positions: scatterPositions });
        if (!state.isInBonusMode && scatterPositions.length >= 3) {
            state.isInBonusMode = true;
            state.remainingFreeSpins = SPINS_PER_SCATTER[scatterPositions.length] || SPINS_PER_SCATTER[5];
            state.totalBonusWin = state.roundWin;
            events.push({ type: 'BONUS_TRIGGERED', spinCount: state.remainingFreeSpins });
        }
        state.spinInProgress = false;
    }
    _endBonusMode(state, events) {
        events.push({ type: 'BONUS_SUMMARY', totalBonusWin: state.totalBonusWin });
        state.isInBonusMode = false;
        state.totalBonusWin = 0;
    }
    _resetForNewSpin(state) {
        state.roundWin = 0;
        state.reelsHaveExpandedThisSpin = false;
        state.spatulaUsedThisSpin = false;
        state.activeRows = BASE_ROWS;
        return state;
    }
    _nextRandom() { this.roundNonce++; const hmac = crypto.createHmac('sha256', this.serverSeed); hmac.update(`${this.clientSeed}-${this.nonce}-${this.roundNonce}`); return parseInt(hmac.digest('hex').substring(0, 13), 16) / Math.pow(2, 52); }
    _createSymbol(id) { return { id, uuid: crypto.randomBytes(16).toString('hex') }; }
    _createIceBlocker() { return { id: 'ice_blocker', uuid: crypto.randomBytes(16).toString('hex'), hp: ICE_BLOCKER_HP }; }
    _createWalkingWild(row, col) { return { id: 'wild_sous_chef', uuid: crypto.randomBytes(16).toString('hex'), row, col, multiplier: 1 }; }
    _countWilds(grid) { return grid.flat().filter(s => (s === null || s === void 0 ? void 0 : s.id) === 'wild_sous_chef').length; }
    _getScatterPositions(grid) { var _a; const pos = []; for (let r = 0; r < MAX_ROWS; r++)
        for (let c = 0; c < COLS - 1; c++)
            if (((_a = grid[r][c]) === null || _a === void 0 ? void 0 : _a.id) === 'scatter_hat')
                pos.push({ row: r, col: c }); return pos; }
    _generateInitialGrid(isBonusBuy) {
        const grid = Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null));
        for (let col = 0; col < COLS - 1; col++)
            for (let row = 0; row < ICE_ROWS; row++)
                grid[row][col] = this._createIceBlocker();
        if (isBonusBuy) {
            const scatterCols = [0, 2, 4];
            for (const col of scatterCols)
                grid[ICE_ROWS + Math.floor(this._nextRandom() * BASE_ROWS)][col] = this._createSymbol('scatter_hat');
        }
        for (let col = 0; col < COLS - 1; col++) {
            for (let row = ICE_ROWS; row < MAX_ROWS; row++) {
                if (grid[row][col] === null) {
                    if (!isBonusBuy && this._nextRandom() < SCATTER_REEL_CHANCE)
                        grid[row][col] = this._createSymbol('scatter_hat');
                    else if (this._nextRandom() < WILD_SPAWN_CHANCE)
                        grid[row][col] = this._createWalkingWild(row, col);
                    else
                        grid[row][col] = this._createSymbol(INGREDIENT_SYMBOLS[Math.floor(this._nextRandom() * INGREDIENT_SYMBOLS.length)]);
                }
            }
        }
        const rand = this._nextRandom() * REEL6_TOTAL_WEIGHT;
        let cumulativeWeight = 0;
        let reel6SymbolId = '86d';
        for (const mod of REEL6_MODIFIERS) {
            if (rand < (cumulativeWeight += mod.weight)) {
                reel6SymbolId = mod.id;
                break;
            }
        }
        const reel6Symbol = this._createSymbol(reel6SymbolId);
        for (let row = ICE_ROWS; row < MAX_ROWS; row++)
            grid[row][COLS - 1] = reel6Symbol;
        return grid;
    }
    _evaluateWins(grid, activeRows) {
        const paylines = [];
        for (const path of PAYLINE_PATHS) {
            const firstSymbol = grid[path[0] + (MAX_ROWS - activeRows)][0];
            if (!firstSymbol || !PAYTABLE[firstSymbol.id])
                continue;
            let count = 1;
            let positions = [{ row: path[0] + (MAX_ROWS - activeRows), col: 0 }];
            for (let col = 1; col < COLS - 1; col++) {
                const symbolOnPath = grid[path[col] + (MAX_ROWS - activeRows)][col];
                if ((symbolOnPath === null || symbolOnPath === void 0 ? void 0 : symbolOnPath.id) === firstSymbol.id) {
                    count++;
                    positions.push({ row: path[col] + (MAX_ROWS - activeRows), col: col });
                }
                else
                    break;
            }
            if (PAYTABLE[firstSymbol.id][count]) {
                paylines.push({ symbolId: firstSymbol.id, count, positions, winAmount: PAYTABLE[firstSymbol.id][count] });
            }
        }
        return paylines;
    }
    _handleSpatulaTransform(state, events) {
        var _a, _b;
        const reel6Id = (_a = state.currentGrid[ICE_ROWS][COLS - 1]) === null || _a === void 0 ? void 0 : _a.id;
        if (reel6Id === 'golden_spatula' && !state.spatulaUsedThisSpin) {
            const fromSymbol = INGREDIENT_SYMBOLS[Math.floor(this._nextRandom() * INGREDIENT_SYMBOLS.length)];
            const toSymbol = INGREDIENT_SYMBOLS[Math.floor(this._nextRandom() * INGREDIENT_SYMBOLS.length)];
            const positions = [];
            for (let r = 0; r < MAX_ROWS; r++)
                for (let c = 0; c < COLS - 1; c++)
                    if (((_b = state.currentGrid[r][c]) === null || _b === void 0 ? void 0 : _b.id) === fromSymbol)
                        positions.push({ row: r, col: c });
            if (positions.length > 0) {
                positions.forEach(p => state.currentGrid[p.row][p.col] = this._createSymbol(toSymbol));
                events.push({ type: 'SPATULA_TRANSFORM', fromSymbol, toSymbol, positions });
                state.spatulaUsedThisSpin = true;
            }
        }
    }
    _applyReel6Multiplier(grid, paylines) {
        var _a;
        const reel6Id = (_a = grid[ICE_ROWS][COLS - 1]) === null || _a === void 0 ? void 0 : _a.id;
        if (reel6Id === null || reel6Id === void 0 ? void 0 : reel6Id.startsWith('x')) {
            const multiplier = parseInt(reel6Id.substring(1));
            const highestPayline = paylines.reduce((max, p) => p.winAmount > max.winAmount ? p : max, paylines[0]);
            highestPayline.winAmount *= multiplier;
            const event = { type: 'REEL_6_ACTIVATION', winningPayline: highestPayline, winAmount: highestPayline.winAmount };
            return { newPaylines: paylines, event };
        }
        return { newPaylines: paylines, event: null };
    }
    _performCascade(grid, paylines) {
        const clearedPositions = [...new Set(paylines.flatMap(p => p.positions))];
        const iceBreakEvents = [];
        clearedPositions.forEach(pos => {
            for (let r = Math.max(0, pos.row - 1); r <= Math.min(MAX_ROWS - 1, pos.row + 1); r++) {
                for (let c = Math.max(0, pos.col - 1); c <= Math.min(COLS - 2, pos.col + 1); c++) {
                    const cell = grid[r][c];
                    if ((cell === null || cell === void 0 ? void 0 : cell.id) === 'ice_blocker') {
                        cell.hp--;
                        iceBreakEvents.push({ pos: { row: r, col: c }, newHp: cell.hp });
                    }
                }
            }
        });
        clearedPositions.forEach(p => grid[p.row][p.col] = null);
        return { clearedPositions, iceBreakEvents };
    }
    _performGravity(grid) {
        for (let c = 0; c < COLS - 1; c++) {
            for (let r = MAX_ROWS - 1; r > 0; r--) {
                if (grid[r][c] === null) {
                    let swapRow = r - 1;
                    while (swapRow >= 0 && grid[swapRow][c] === null)
                        swapRow--;
                    if (swapRow >= 0) {
                        grid[r][c] = grid[swapRow][c];
                        grid[swapRow][c] = null;
                    }
                }
            }
        }
    }
    _refillEmpty(grid) {
        for (let c = 0; c < COLS - 1; c++)
            for (let r = 0; r < MAX_ROWS; r++) {
                if (grid[r][c] === null)
                    grid[r][c] = this._createSymbol(INGREDIENT_SYMBOLS[Math.floor(this._nextRandom() * INGREDIENT_SYMBOLS.length)]);
            }
    }
    _moveWilds(grid) {
        const moves = [];
        for (let r = 0; r < MAX_ROWS; r++)
            for (let c = 0; c < COLS - 1; c++) {
                const cell = grid[r][c];
                if ((cell === null || cell === void 0 ? void 0 : cell.id) === 'wild_sous_chef') {
                    const wild = cell;
                    const from = { row: r, col: c };
                    let to = { row: r, col: c - 1 };
                    if (c > 0 && grid[r][c - 1] === null) {
                        grid[r][c - 1] = wild;
                        grid[r][c] = null;
                    }
                    else {
                        to = from;
                    }
                    moves.push({ from, to });
                }
            }
        return { moves };
    }
}
exports.GameEngine = GameEngine;
//# sourceMappingURL=GameEngine.js.map