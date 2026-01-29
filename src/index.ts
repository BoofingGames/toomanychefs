
import express from 'express';
import { GameEngine, GameState } from './GameEngine.js';

// =================================================================================
// --- API Server Setup ---
// =================================================================================

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// A simple in-memory store for game states. In a real-world scenario,
// this would be a database like Firestore or Redis.
const playerGameStates: Map<string, GameState> = new Map();

app.post('/spin', (req, res) => {
    const { playerId, clientSeed, serverSeed, nonce } = req.body;

    if (!playerId || !clientSeed || !serverSeed || nonce === undefined) {
        return res.status(400).json({ error: 'Missing required fields: playerId, clientSeed, serverSeed, nonce.' });
    }

    try {
        // Get the player's current state, or create a new one.
        let currentState = playerGameStates.get(playerId) || GameEngine.getInitialState(playerId);

        // For a player-initiated spin, we must signal that it's not an automatic process.
        // The engine will then handle starting the spinInProgress loop if wins or bonuses occur.
        currentState.spinInProgress = false;

        // --- Create the engine and process the spin ---
        // The engine is now created once per request, not multiple times.
        const engine = new GameEngine(serverSeed, clientSeed);
        const result = engine.processSpin(currentState, nonce);

        // --- Save the new state and send the result ---
        playerGameStates.set(playerId, result.newState);

        console.log(`Spin processed for ${playerId}. New state:`, result.newState);

        res.json({
            newState: result.newState,
            events: result.eventSequence,
            totalWin: result.totalWinInStep
        });

    } catch (error) {
        console.error('An error occurred during the spin:', error);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`)
});
