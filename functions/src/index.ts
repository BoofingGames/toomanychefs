
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import express from 'express';
import * as crypto from 'crypto';
import { GameEngine, BONUS_SPINS_AWARDED } from './GameEngine';

const app = express();

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
app.post('/api/spin', (req, res) => {
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

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

// Expose the express app as a Firebase Function
export const api = onRequest(app);
