
import express, { Request, Response } from 'express';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { GameEngine, GameState, SpinResult } from './GameEngine.js';
import { BONUS_BUY_COST } from './GameEngine.js';
import { listMovies, connectorConfig } from "./dataconnect-admin-generated/index.js";
import { getDataConnect } from "firebase-admin/data-connect";

// --- Firebase and Express Initialization ---
admin.initializeApp();
const app = express();
const db = getFirestore();
const dc = getDataConnect(connectorConfig);

// --- Middleware ---
app.use(express.static('public'));
app.use(express.json());

// =================================================================================
// --- STATEFUL API ENDPOINTS (Corrected for Firestore & TypeScript) ---
// =================================================================================

const getUserId = (req: Request): string => {
    // In a real application, this would come from an authenticated user token.
    return "player1";
}

app.get('/api/state', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const userStateRef = db.collection('gameStates').doc(userId);

    try {
        const doc = await userStateRef.get();
        if (!doc.exists) {
            console.log(`No state for ${userId}, creating...`);
            const initialState = GameEngine.getInitialState(userId);
            const stateToSave = { ...initialState, currentGrid: JSON.stringify(initialState.currentGrid) };
            await userStateRef.set(stateToSave);
            return res.json(initialState);
        }

        const stateFromDb = doc.data();
        // --- FIX: Check for undefined before accessing properties ---
        if (stateFromDb) {
            const currentState = {
                ...stateFromDb,
                currentGrid: typeof stateFromDb.currentGrid === 'string' 
                    ? JSON.parse(stateFromDb.currentGrid) 
                    : stateFromDb.currentGrid
            };
            return res.json(currentState);
        }
        // This case should ideally not be reached if doc.exists is true
        return res.status(404).send({ error: 'Game state document exists but is empty.' });

    } catch (error) {
        console.error("Error getting state:", error);
        return res.status(500).send({ error: 'Failed to retrieve game state.' });
    }
});

app.post('/api/spin', async (req: Request, res: Response) => {
    const { clientSeed, nonce } = req.body;
    if (!clientSeed || nonce === undefined) {
        return res.status(400).send({ error: 'clientSeed and nonce are required.' });
    }

    const userId = getUserId(req);
    const userStateRef = db.collection('gameStates').doc(userId);

    try {
        const doc = await userStateRef.get();
        let currentState: GameState;
        const stateFromDb = doc.data();

        if (!doc.exists || !stateFromDb) {
            currentState = GameEngine.getInitialState(userId);
        } else {
            // --- FIX: Check for undefined is handled by the enclosing if/else ---
            currentState = {
                ...stateFromDb,
                currentGrid: typeof stateFromDb.currentGrid === 'string' 
                    ? JSON.parse(stateFromDb.currentGrid) 
                    : stateFromDb.currentGrid
            } as GameState;
        }

        const serverSeed = crypto.randomBytes(32).toString('hex');
        const engine = new GameEngine(serverSeed, clientSeed, Number(nonce));
        const result: SpinResult = engine.processSpin(currentState);

        const stateToSave = { ...result.newState, currentGrid: JSON.stringify(result.newState.currentGrid) };
        await userStateRef.set(stateToSave);

        return res.json({
            eventSequence: result.eventSequence,
            serverSeed: serverSeed
        });

    } catch (error) {
        console.error("Error processing spin:", error);
        return res.status(500).send({ error: (error as Error).message });
    }
});

app.post('/api/buy-bonus', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const userStateRef = db.collection('gameStates').doc(userId);

    try {
        const doc = await userStateRef.get();
        const stateFromDb = doc.data();

        if (!doc.exists || !stateFromDb) {
            return res.status(404).send({ error: 'No game state found. Please spin first.' });
        }

        // --- FIX: Check for undefined is handled by the enclosing if/else ---
        let currentState = {
            ...stateFromDb,
            currentGrid: typeof stateFromDb.currentGrid === 'string' 
                ? JSON.parse(stateFromDb.currentGrid) 
                : stateFromDb.currentGrid
        } as GameState;

        if (currentState.balance < BONUS_BUY_COST) {
            return res.status(400).send({ error: 'Insufficient balance for Bonus Buy.' });
        }
        if (currentState.spinInProgress) {
            return res.status(400).send({ error: 'Cannot buy bonus while a spin is in progress.' });
        }

        currentState.balance -= BONUS_BUY_COST;
        currentState.requestBonusBuy = true;

        const stateToSave = { ...currentState, currentGrid: JSON.stringify(currentState.currentGrid) };
        await userStateRef.set(stateToSave);

        return res.json({
            success: true,
            newBalance: currentState.balance,
            message: 'Bonus Buy initiated. Press Spin to play your guaranteed bonus round.'
        });

    } catch (error) {
        console.error("Error initiating bonus buy:", error);
        return res.status(500).send({ error: 'An internal error occurred.' });
    }
});

// --- Other API Routes (Unchanged) ---
app.get("/api/movies", async (req: Request, res: Response) => {
    const result = await listMovies(dc);
    return res.json(result.data.movies);
});

app.get('/', (req: Request, res: Response) => {
    res.sendFile('index.html', { root: 'public' });
});

// --- Server Start ---
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
