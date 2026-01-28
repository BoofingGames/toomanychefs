
import express, { Request, Response } from 'express';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { GameEngine, GameState, SpinResult } from './GameEngine';
import { BONUS_BUY_COST } from './GameEngine';
import { listMovies, connectorConfig } from "./dataconnect-admin-generated";
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
// --- STATEFUL API ENDPOINTS (Corrected) ---
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
            const initialState = GameEngine.getInitialState(userId);
            await userStateRef.set(initialState);
            return res.json(initialState);
        }
        // --- FIX: Added missing return statement ---
        return res.json(doc.data());
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
        if (!doc.exists) {
            currentState = GameEngine.getInitialState(userId);
        } else {
            currentState = doc.data() as GameState;
        }

        const serverSeed = crypto.randomBytes(32).toString('hex');
        // --- FIX: Ensure nonce is a number ---
        const engine = new GameEngine(serverSeed, clientSeed, Number(nonce));
        const result: SpinResult = engine.processSpin(currentState);

        await userStateRef.set(result.newState);
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
        if (!doc.exists) {
            return res.status(404).send({ error: 'No game state found. Please spin first.' });
        }

        let currentState = doc.data() as GameState;
        if (currentState.balance < BONUS_BUY_COST) {
            return res.status(400).send({ error: 'Insufficient balance for Bonus Buy.' });
        }
        if (currentState.spinInProgress) {
            return res.status(400).send({ error: 'Cannot buy bonus while a spin is in progress.' });
        }

        currentState.balance -= BONUS_BUY_COST;
        currentState.requestBonusBuy = true;

        await userStateRef.set(currentState);

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
