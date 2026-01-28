
import * as crypto from 'crypto';
import { GameEngine, GameState } from './src/GameEngine.js';

// =================================================================================
// --- VOLATILITY SIMULATION (Updated for Modern GameEngine) ---
// =================================================================================

const NUM_ROUNDS = 100000; // 100k rounds to get a decent statistical sample.
const BASE_BET = 10; // The fixed bet amount for each main round.

// --- Statistics Trackers ---
let totalWinAmount = 0;
let totalBaseGameWinAmount = 0;
let totalBonusWinAmount = 0;
let totalWins = 0; // Rounds where total win > 0
let bonusTriggers = 0;
let maxWin = 0;

/**
 * Simulates a full game round, including the initial spin and all subsequent
 * automatic actions (cascades, bonus spins).
 * @param serverSeed The server seed for the round.
 * @returns The total win for the entire round and whether a bonus was triggered.
 */
function simulateFullRound(serverSeed: string) {
    const clientSeed = crypto.randomBytes(16).toString('hex');
    let nonce = 0;

    // Start with a fresh state for each round.
    let currentState: GameState = GameEngine.getInitialState('simulation-player');
    let roundTotalWin = 0;
    let roundBaseGameWin = 0;
    let roundBonusGameWin = 0;
    let bonusWasTriggered = false;

    // --- Execute the first spin (player-initiated) ---
    const engine = new GameEngine(serverSeed, clientSeed, nonce);
    const initialResult = engine.processSpin(currentState);
    
    currentState = initialResult.newState;
    roundTotalWin += initialResult.totalWinInStep;

    // Check events from the first spin
    for (const event of initialResult.eventSequence) {
        if (event.type === 'WIN') {
            // All wins in the first step are base game wins
            roundBaseGameWin += event.paylines.reduce((sum, p) => sum + p.winAmount, 0);
        }
        if (event.type === 'BONUS_TRIGGERED') {
            bonusWasTriggered = true;
        }
    }

    // --- Process all automatic follow-up actions (cascades, bonus spins) ---
    // The loop continues as long as the game is in an automatic "inProgress" state.
    while (currentState.spinInProgress) {
        nonce++; // IMPORTANT: Increment nonce for each step to ensure unique outcomes
        const nextEngine = new GameEngine(serverSeed, clientSeed, nonce);
        const nextResult = nextEngine.processSpin(currentState);
        
        currentState = nextResult.newState;
        roundTotalWin += nextResult.totalWinInStep;

        // Check events from this step
        for (const event of nextResult.eventSequence) {
            if (event.type === 'WIN') {
                const stepWin = event.paylines.reduce((sum, p) => sum + p.winAmount, 0);
                if (event.isBonusSpin) {
                    roundBonusGameWin += stepWin;
                } else {
                    roundBaseGameWin += stepWin;
                }
            }
        }
    }

    return { roundTotalWin, roundBaseGameWin, roundBonusGameWin, bonusWasTriggered };
}

/**
 * The main simulation function.
 */
function runSimulation() {
    console.log('--- Starting Volatility Simulation (Modern Engine) ---');
    console.log(`Simulating ${NUM_ROUNDS} full game rounds...`);
    const startTime = Date.now();

    for (let i = 0; i < NUM_ROUNDS; i++) {
        const serverSeed = crypto.randomBytes(32).toString('hex');
        const { roundTotalWin, roundBaseGameWin, roundBonusGameWin, bonusWasTriggered } = simulateFullRound(serverSeed);

        // --- Update Global Statistics ---
        totalWinAmount += roundTotalWin;
        if (bonusWasTriggered) {
            bonusTriggers++;
            totalBaseGameWinAmount += roundBaseGameWin;
            totalBonusWinAmount += roundBonusGameWin;
        } else {
            // If no bonus, the entire win is from the base game.
            totalBaseGameWinAmount += roundTotalWin;
        }

        if (roundTotalWin > 0) {
            totalWins++;
        }
        if (roundTotalWin > maxWin) {
            maxWin = roundTotalWin;
        }

        if ((i + 1) % 1000 === 0) {
            console.log(`... Progress: ${((i + 1) / NUM_ROUNDS * 100).toFixed(0)}%`);
        }
    }
    const endTime = Date.now();

    // --- Final Report ---
    const totalCost = NUM_ROUNDS * BASE_BET;
    const totalRTP = (totalWinAmount / totalCost) * 100;
    const baseGameRTP = (totalBaseGameWinAmount / totalCost) * 100;
    const bonusGameRTP = (totalBonusWinAmount / totalCost) * 100;
    const hitFrequency = (totalWins / NUM_ROUNDS) * 100;
    const bonusFrequency = bonusTriggers > 0 ? (NUM_ROUNDS / bonusTriggers) : 0;
    const avgBonusWin = bonusTriggers > 0 ? (totalBonusWinAmount / bonusTriggers / BASE_BET) : 0;
    const totalDuration = (endTime - startTime) / 1000;

    console.log(`\n--- Simulation Complete: Final Report ---`);
    console.log(`Total Rounds Simulated: ${NUM_ROUNDS.toLocaleString()} in ${totalDuration.toFixed(2)} seconds`);
    console.log(`Total Bet Amount: ${totalCost.toLocaleString()}`);
    console.log(`Total Win Amount: ${totalWinAmount.toLocaleString()}`);
    console.log(`\n--- Economic & Volatility Analysis ---`);
    console.log(`- Total Return to Player (RTP): ${totalRTP.toFixed(4)}%`);
    console.log(`    - Base Game Contribution: ${baseGameRTP.toFixed(4)}%`);
    console.log(`    - Bonus Game Contribution: ${bonusGameRTP.toFixed(4)}%`);
    console.log(`- Hit Frequency (any win): ${hitFrequency.toFixed(2)}%`);
    console.log(`- Bonus Frequency: 1 in ~${bonusFrequency.toFixed(2)} spins`);
    console.log(`- Average Bonus Win: ${avgBonusWin.toFixed(2)}x bet`);
    console.log(`- Max Win Recorded: ${(maxWin / BASE_BET).toFixed(2)}x bet`);
    console.log(`- Total Bonus Triggers: ${bonusTriggers.toLocaleString()}`);
    console.log(`------------------------------------\n`);
}

runSimulation();
