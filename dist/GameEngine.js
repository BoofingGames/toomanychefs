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
exports.GameEngine = exports.BONUS_SPINS_AWARDED = void 0;
const crypto = __importStar(require("crypto"));
// --- CONFIGURATION ---
const ROWS = 3;
const COLS = 6;
const INGREDIENT_SYMBOLS = ['tomato', 'onion', 'beef', 'bread', 'cheese'];
const PAYTABLE = {
    'cheese': { 3: 10, 4: 25, 5: 100 },
    'beef': { 3: 8, 4: 20, 5: 80 },
    'bread': { 3: 6, 4: 15, 5: 60 },
    'onion': { 3: 4, 4: 10, 5: 40 },
    'tomato': { 3: 2, 4: 5, 5: 20 },
};
const PAYLINE_PATHS = [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2]];
const REEL6_MODIFIERS = [{ id: 'x500', weight: 1 }, { id: 'x100', weight: 1 }, { id: 'x10', weight: 8 }, { id: 'x2', weight: 40 }, { id: '86d', weight: 950 }];
const REEL6_TOTAL_WEIGHT = REEL6_MODIFIERS.reduce((sum, mod) => sum + mod.weight, 0);
exports.BONUS_SPINS_AWARDED = 10;
// --- CORE LOGIC ---
class GameEngine {
    constructor(serverSeed, clientSeed, nonce) {
        this.roundNonce = 0;
        this.serverSeed = serverSeed;
        this.clientSeed = clientSeed;
        this.nonce = nonce;
    }
    nextRandom() {
        this.roundNonce++;
        const hmac = crypto.createHmac('sha256', this.serverSeed);
        hmac.update(`'${this.clientSeed}'_'_'${this.nonce}'_'_'${this.roundNonce}'`);
        return parseInt(hmac.digest('hex').substring(0, 13), 16) / Math.pow(2, 52);
    }
    createSymbol(id) { return { id, uuid: crypto.randomBytes(16).toString('hex') }; }
    generateInitialGrid() {
        const grid = Array.from({ length: ROWS }, () => []);
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS - 1; col++) {
                grid[row][col] = this.createSymbol(INGREDIENT_SYMBOLS[Math.floor(this.nextRandom() * INGREDIENT_SYMBOLS.length)]);
            }
        }
        const rand = this.nextRandom() * REEL6_TOTAL_WEIGHT;
        let cumulativeWeight = 0;
        let reel6SymbolId = '86d';
        for (const mod of REEL6_MODIFIERS) {
            if (rand < (cumulativeWeight += mod.weight)) {
                reel6SymbolId = mod.id;
                break;
            }
        }
        const reel6Symbol = this.createSymbol(reel6SymbolId);
        for (let row = 0; row < ROWS; row++) {
            grid[row][COLS - 1] = reel6Symbol;
        }
        return grid;
    }
    evaluateWins(grid) {
        var _a;
        const wins = [];
        for (const path of PAYLINE_PATHS) {
            const lineSymbols = [];
            for (let col = 0; col < COLS - 1; col++) {
                const symbol = grid[path[col]][col];
                if (symbol) {
                    lineSymbols.push({ symbol, pos: { row: path[col], col } });
                }
            }
            if (lineSymbols.length === 0)
                continue;
            const firstSymbol = lineSymbols[0].symbol;
            if (firstSymbol.id === 'wild_sous_chef')
                continue;
            let count = 1;
            const positions = [lineSymbols[0].pos];
            for (let i = 1; i < lineSymbols.length; i++) {
                const currentSymbol = lineSymbols[i].symbol;
                if (currentSymbol.id === firstSymbol.id || currentSymbol.id === 'wild_sous_chef') {
                    count++;
                    positions.push(lineSymbols[i].pos);
                }
                else {
                    break;
                }
            }
            if ((_a = PAYTABLE[firstSymbol.id]) === null || _a === void 0 ? void 0 : _a[count]) {
                wins.push({ symbolId: firstSymbol.id, count, positions, winAmount: PAYTABLE[firstSymbol.id][count] });
            }
        }
        return wins;
    }
    evaluateReel6(paylines, grid) {
        var _a;
        const fiveOfAKindPayline = paylines.find(p => p.count === 5 && p.positions.every(pos => { var _a; return ((_a = grid[pos.row][pos.col]) === null || _a === void 0 ? void 0 : _a.id) !== 'wild_sous_chef'; }));
        if (!fiveOfAKindPayline)
            return { multiplier: 1 };
        const reel6Id = (_a = grid[0][COLS - 1]) === null || _a === void 0 ? void 0 : _a.id;
        if (!reel6Id)
            return { multiplier: 1 };
        const multiplier = parseInt(reel6Id.replace('x', ''));
        return isNaN(multiplier) ? { multiplier: 1 } : { multiplier, payline: fiveOfAKindPayline };
    }
    performCascade(grid, paylines) {
        let newGrid = grid.map(row => [...row]);
        const clearedPositions = [...new Set(paylines.flatMap(p => p.positions))];
        clearedPositions.forEach(pos => { newGrid[pos.row][pos.col] = null; });
        return { newGrid, clearedPositions };
    }
    refillGrid(grid) {
        let newGrid = grid.map(row => [...row]);
        for (let col = 0; col < COLS - 1; col++) {
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
    moveAndCollideWilds(grid) {
        return { gridAfterWilds: grid, moves: [] };
    }
    resolveSpin() {
        const eventSequence = [];
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
                if (moves.length > 0)
                    eventSequence.push({ type: 'WILD_MOVE', moves });
                if (chaosEvent && chaosEvent.type === 'KITCHEN_CHAOS_COLLISION' && chaosEvent.outcome === 'BUST') {
                    eventSequence.push(chaosEvent);
                    totalWin = 0;
                    break;
                }
                currentGrid = this.refillGrid(currentGrid);
                eventSequence.push({ type: 'REFILL', newGrid: currentGrid });
            }
            else {
                isCascading = false;
            }
        }
        eventSequence.push({ type: 'ROUND_SUMMARY', finalGrid: currentGrid, totalWin });
        return { finalTotalWin: totalWin, finalGrid: currentGrid, eventSequence, bonusTriggered: false };
    }
}
exports.GameEngine = GameEngine;
//# sourceMappingURL=GameEngine.js.map