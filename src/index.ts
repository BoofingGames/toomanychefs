import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import express, { Request, Response } from 'express';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { GameEngine, BONUS_SPINS_AWARDED } from './GameEngine';
import { listMovies, connectorConfig } from "./dataconnect-admin-generated";
import { getDataConnect } from "firebase-admin/data-connect";

admin.initializeApp();

const app = express();
const dc = getDataConnect(connectorConfig);

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Game Logic
export const resolveBet = (
    serverSeed: string,
    clientSeed: string,
    nonce: number
) => {
    const engine = new GameEngine(serverSeed, clientSeed, nonce);
    const result = engine.resolveSpin(false);
    return {
        finalTotalWin: result.finalTotalWin,
        grid: result.grid,
        winningPaylines: result.winningPaylines,
        reel6Multiplier: result.reel6Multiplier,
        bonusTriggered: result.bonusTriggered,
    };
};

export const resolveBonus = (serverSeed: string, clientSeed: string, nonce: number) => {
    let totalBonusWin = 0;
    const bonusSpins = [];
    for (let i = 0; i < BONUS_SPINS_AWARDED; i++) {
        const spinNonce = nonce + i + 1;
        const engine = new GameEngine(serverSeed, clientSeed, spinNonce);
        const spinResult = engine.resolveSpin(true);
        totalBonusWin += spinResult.finalTotalWin;
        bonusSpins.push(spinResult);
    }
    return {
        totalBonusWin,
        bonusSpins,
    };
};

// API route
app.post('/api/spin', (req: Request, res: Response) => {
    logger.info("Spin request received", { body: req.body });
    const { clientSeed, nonce } = req.body;

    if (!clientSeed || nonce === undefined) {
        logger.error("Bad request: clientSeed or nonce missing");
        return res.status(400).send({ error: 'clientSeed and nonce are required.' });
    }

    const serverSeed = crypto.randomBytes(16).toString('hex');
    const result = resolveBet(serverSeed, clientSeed, nonce);

    if (result.bonusTriggered) {
        const bonusResult = resolveBonus(serverSeed, clientSeed, nonce);
        (result as any).bonusResult = bonusResult;
    }

    return res.json(result);
});

app.get("/api/movies", async (req: Request, res: Response) => {
  const result = await listMovies(dc);
  return res.json(result.data.movies);
});

// Serve the main page
app.get('/', (req: Request, res: Response) => {
    res.sendFile('index.html', { root: 'public' });
});

// Expose the express app as a Firebase Function
export const api = onRequest(app);
