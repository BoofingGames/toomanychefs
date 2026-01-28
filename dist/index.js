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
const express_1 = __importDefault(require("express"));
const crypto = __importStar(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const GameEngine_1 = require("./GameEngine");
const GameEngine_2 = require("./GameEngine");
const dataconnect_admin_generated_1 = require("./dataconnect-admin-generated");
const data_connect_1 = require("firebase-admin/data-connect");
// --- Firebase and Express Initialization ---
admin.initializeApp();
const app = (0, express_1.default)();
const db = (0, firestore_1.getFirestore)();
const dc = (0, data_connect_1.getDataConnect)(dataconnect_admin_generated_1.connectorConfig);
// --- Middleware ---
app.use(express_1.default.static('public'));
app.use(express_1.default.json());
// =================================================================================
// --- STATEFUL API ENDPOINTS (Corrected for Firestore) ---
// =================================================================================
const getUserId = (req) => {
    // In a real application, this would come from an authenticated user token.
    return "player1";
};
app.get('/api/state', async (req, res) => {
    const userId = getUserId(req);
    const userStateRef = db.collection('gameStates').doc(userId);
    try {
        const doc = await userStateRef.get();
        if (!doc.exists) {
            console.log(`No state for ${userId}, creating...`);
            const initialState = GameEngine_1.GameEngine.getInitialState(userId);
            // FIX: Serialize grid before initial save
            const stateToSave = Object.assign(Object.assign({}, initialState), { currentGrid: JSON.stringify(initialState.currentGrid) });
            await userStateRef.set(stateToSave);
            return res.json(initialState); // Return original state to client
        }
        // FIX: Deserialize currentGrid on read
        const stateFromDb = doc.data();
        const currentState = Object.assign(Object.assign({}, stateFromDb), { currentGrid: typeof stateFromDb.currentGrid === 'string'
                ? JSON.parse(stateFromDb.currentGrid)
                : stateFromDb.currentGrid });
        return res.json(currentState);
    }
    catch (error) {
        console.error("Error getting state:", error);
        return res.status(500).send({ error: 'Failed to retrieve game state.' });
    }
});
app.post('/api/spin', async (req, res) => {
    const { clientSeed, nonce } = req.body;
    if (!clientSeed || nonce === undefined) {
        return res.status(400).send({ error: 'clientSeed and nonce are required.' });
    }
    const userId = getUserId(req);
    const userStateRef = db.collection('gameStates').doc(userId);
    try {
        const doc = await userStateRef.get();
        let currentState;
        if (!doc.exists) {
            currentState = GameEngine_1.GameEngine.getInitialState(userId);
        }
        else {
            // FIX: Deserialize currentGrid on read
            const stateFromDb = doc.data();
            currentState = Object.assign(Object.assign({}, stateFromDb), { currentGrid: typeof stateFromDb.currentGrid === 'string'
                    ? JSON.parse(stateFromDb.currentGrid)
                    : stateFromDb.currentGrid });
        }
        const serverSeed = crypto.randomBytes(32).toString('hex');
        const engine = new GameEngine_1.GameEngine(serverSeed, clientSeed, Number(nonce));
        const result = engine.processSpin(currentState);
        // FIX: Serialize currentGrid before saving
        const stateToSave = Object.assign(Object.assign({}, result.newState), { currentGrid: JSON.stringify(result.newState.currentGrid) });
        await userStateRef.set(stateToSave);
        return res.json({
            eventSequence: result.eventSequence,
            serverSeed: serverSeed
        });
    }
    catch (error) {
        console.error("Error processing spin:", error);
        return res.status(500).send({ error: error.message });
    }
});
app.post('/api/buy-bonus', async (req, res) => {
    const userId = getUserId(req);
    const userStateRef = db.collection('gameStates').doc(userId);
    try {
        const doc = await userStateRef.get();
        if (!doc.exists) {
            return res.status(404).send({ error: 'No game state found. Please spin first.' });
        }
        // FIX: Deserialize currentGrid on read
        const stateFromDb = doc.data();
        let currentState = Object.assign(Object.assign({}, stateFromDb), { currentGrid: typeof stateFromDb.currentGrid === 'string'
                ? JSON.parse(stateFromDb.currentGrid)
                : stateFromDb.currentGrid });
        if (currentState.balance < GameEngine_2.BONUS_BUY_COST) {
            return res.status(400).send({ error: 'Insufficient balance for Bonus Buy.' });
        }
        if (currentState.spinInProgress) {
            return res.status(400).send({ error: 'Cannot buy bonus while a spin is in progress.' });
        }
        currentState.balance -= GameEngine_2.BONUS_BUY_COST;
        currentState.requestBonusBuy = true;
        // FIX: Serialize currentGrid before saving
        const stateToSave = Object.assign(Object.assign({}, currentState), { currentGrid: JSON.stringify(currentState.currentGrid) });
        await userStateRef.set(stateToSave);
        return res.json({
            success: true,
            newBalance: currentState.balance,
            message: 'Bonus Buy initiated. Press Spin to play your guaranteed bonus round.'
        });
    }
    catch (error) {
        console.error("Error initiating bonus buy:", error);
        return res.status(500).send({ error: 'An internal error occurred.' });
    }
});
// --- Other API Routes (Unchanged) ---
app.get("/api/movies", async (req, res) => {
    const result = await (0, dataconnect_admin_generated_1.listMovies)(dc);
    return res.json(result.data.movies);
});
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});
// --- Server Start ---
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
//# sourceMappingURL=index.js.map