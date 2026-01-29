
import * as crypto from 'crypto';
import { GameEngine, GameState } from './src/GameEngine.js';

// =================================================================================
// --- VOLATILITY SIMULATION (High-Performance Refactor) ---
// =================================================================================

const NUM_ROUNDS = 100000; // 100k rounds for a robust statistical sample.
const BASE_BET = 10;

// --- Statistics Trackers ---
let totalWinAmount = 0;
let totalBaseGameWinAmount = 0;
let totalBonusWinAmount = 0;
let totalWins = 0;
let bonusTriggers = 0;
let maxWin = 0;

/**
 * Simulates a full game round, creating the GameEngine only once.
 * @param serverSeed The server seed for the entire round.
 */
function simulateFullRound(serverSeed: string) {
    const clientSeed = crypto.randomBytes(16).toString('hex');
    const engine = new GameEngine(serverSeed, clientSeed); // Create engine ONCE per round.
    let nonce = 0;

    let currentState: GameState = GameEngine.getInitialState('simulation-player');
    let roundTotalWin = 0;
    let roundBaseGameWin = 0;
    let roundBonusGameWin = 0;
    let bonusWasTriggered = false;

    // --- Initial Spin (player-initiated) ---
    // The first action is always to set spinInProgress to false for a paid spin.
    const paidSpinState = { ...currentState, spinInProgress: false };
    const initialResult = engine.processSpin(paidSpinState, nonce);
    
    currentState = initialResult.newState;
    roundTotalWin += initialResult.totalWinInStep;

    for (const event of initialResult.eventSequence) {
        if (event.type === 'WIN') {
            roundBaseGameWin += event.paylines.reduce((sum, p) => sum + p.winAmount, 0);
        }
        if (event.type === 'BONUS_TRIGGERED') {
            bonusWasTriggered = true;
        }
    }

    // --- Automatic Follow-up Actions (Cascades, Bonus Spins) ---
    // This loop now processes all subsequent actions without creating new engines.
    while (currentState.spinInProgress) {
        nonce++; // CRITICAL: Increment nonce for each automatic step.
        const nextResult = engine.processSpin(currentState, nonce);
        
        currentState = nextResult.newState;
        roundTotalWin += nextResult.totalWinInStep;

        for (const event of nextResult.eventSequence) {
            if (event.type === 'WIN') {
                const stepWin = event.paylines.reduce((sum, p) => sum + p.winAmount, 0);
                if (event.isBonusSpin) {
                    roundBonusGameWin += stepWin;
                } else {
                    // This handles wins from cascades that happen in the base game.
                    roundBaseGameWin += stepWin;
                }
            }
        }
    }

    return { roundTotalWin, roundBaseGameWin, roundBonusGameWin, bonusWasTriggered };
}

/**
 * The main simulation runner.
 */
function runSimulation() {
    console.log('--- Starting Volatility Simulation (High-Performance) ---');
    console.log(`Simulating ${NUM_ROUNDS} full game rounds...`);
    const startTime = Date.now();

    for (let i = 0; i < NUM_ROUNDS; i++) {
        const serverSeed = crypto.randomBytes(32).toString('hex');
        const { roundTotalWin, roundBaseGameWin, roundBonusGameWin, bonusWasTriggered } = simulateFullRound(serverSeed);

        // Update global statistics
        totalWinAmount += roundTotalWin;
        totalBaseGameWinAmount += roundBaseGameWin;
        totalBonusWinAmount += roundBonusGameWin;

        if (bonusWasTriggered) {
            bonusTriggers++;
        }
        if (roundTotalWin > 0) {
            totalWins++;
        }
        if (roundTotalWin > maxWin) {
            maxWin = roundTotalWin;
        }

        if ((i + 1) % 1000 === 0) { // Progress update every 1,000 rounds
            console.log(`... Progress: ${((i + 1) / NUM_ROUNDS * 100).toFixed(0)}%`);
        }
    }
    const endTime = Date.now();

    // Final report calculation and printing
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
