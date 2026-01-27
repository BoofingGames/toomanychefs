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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = exports.resolveBonus = exports.resolveBet = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const express_1 = __importDefault(require("express"));
const crypto = __importStar(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const GameEngine_1 = require("./GameEngine");
const dataconnect_admin_generated_1 = require("./dataconnect-admin-generated");
const data_connect_1 = require("firebase-admin/data-connect");
admin.initializeApp();
const app = (0, express_1.default)();
const dc = (0, data_connect_1.getDataConnect)(dataconnect_admin_generated_1.connectorConfig);
// Middleware
app.use(express_1.default.static('public'));
app.use(express_1.default.json());
// Game Logic
const resolveBet = (serverSeed, clientSeed, nonce) => {
    const engine = new GameEngine_1.GameEngine(serverSeed, clientSeed, nonce);
    const result = engine.resolveSpin(false);
    return {
        finalTotalWin: result.finalTotalWin,
        grid: result.grid,
        winningPaylines: result.winningPaylines,
        reel6Multiplier: result.reel6Multiplier,
        bonusTriggered: result.bonusTriggered,
    };
};
exports.resolveBet = resolveBet;
const resolveBonus = (serverSeed, clientSeed, nonce) => {
    let totalBonusWin = 0;
    const bonusSpins = [];
    for (let i = 0; i < GameEngine_1.BONUS_SPINS_AWARDED; i++) {
        const spinNonce = nonce + i + 1;
        const engine = new GameEngine_1.GameEngine(serverSeed, clientSeed, spinNonce);
        const spinResult = engine.resolveSpin(true);
        totalBonusWin += spinResult.finalTotalWin;
        bonusSpins.push(spinResult);
    }
    return {
        totalBonusWin,
        bonusSpins,
    };
};
exports.resolveBonus = resolveBonus;
// API route
app.post('/api/spin', (req, res) => {
    logger.info("Spin request received", { body: req.body });
    const { clientSeed, nonce } = req.body;
    if (!clientSeed || nonce === undefined) {
        logger.error("Bad request: clientSeed or nonce missing");
        return res.status(400).send({ error: 'clientSeed and nonce are required.' });
    }
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const result = (0, exports.resolveBet)(serverSeed, clientSeed, nonce);
    if (result.bonusTriggered) {
        const bonusResult = (0, exports.resolveBonus)(serverSeed, clientSeed, nonce);
        result.bonusResult = bonusResult;
    }
    return res.json(result);
});
app.get("/api/movies", async (req, res) => {
    const result = await (0, dataconnect_admin_generated_1.listMovies)(dc);
    return res.json(result.data.movies);
});
// Serve the main page
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});
// Expose the express app as a Firebase Function
exports.api = (0, https_1.onRequest)(app);
//# sourceMappingURL=index.js.map