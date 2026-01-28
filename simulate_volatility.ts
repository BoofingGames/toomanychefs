
import * as crypto from 'crypto';
import { GameEngine, BONUS_SPINS_AWARDED } from './src/GameEngine.js';

// =================================================================================
// --- PHASE 2: Final Validation Simulation (Full Game Loop) ---
// =================================================================================

const NUM_ROUNDS = 1000000; // 1 Million main game rounds

// --- Statistics Trackers ---
let totalWinAmount = 0;         // Sum of all wins (base + bonus)
let totalBaseGameWinAmount = 0; // Sum of wins from base game spins ONLY
let totalBonusWinAmount = 0;    // Sum of wins from bonus game spins ONLY
let totalWins = 0;              // Rounds where total win > 0
let bonusTriggers = 0;
let maxWin = 0;

/**
 * The main simulation function for the complete game loop.
 */
function runSimulation() {
    console.log('--- Starting Final Validation Simulation (Full Game Loop) ---');
    console.log(`Simulating ${NUM_ROUNDS} main game rounds...`);
    const startTime = Date.now();

    for (let i = 0; i < NUM_ROUNDS; i++) {
        const serverSeed = crypto.randomBytes(16).toString('hex');
        const clientSeed = `simulation-client-seed-final-${i}`;
        let nonce = i;

        // --- 1. Resolve Base Game Spin ---
        const engine = new GameEngine(serverSeed, clientSeed, nonce);
        const baseGameResult = engine.resolveSpin(false); // isBonusSpin = false

        let roundTotalWin = baseGameResult.finalTotalWin;
        totalBaseGameWinAmount += baseGameResult.finalTotalWin;

        // --- 2. Check for and Resolve Bonus Game ---
        if (baseGameResult.bonusTriggered) {
            bonusTriggers++;
            let currentBonusTotalWin = 0;

            // --- Bonus Spin Loop ---
            for (let j = 0; j < BONUS_SPINS_AWARDED; j++) {
                nonce++; // IMPORTANT: Increment nonce for each bonus spin to ensure unique outcomes
                const bonusSpinEngine = new GameEngine(serverSeed, clientSeed, nonce);
                const bonusSpinResult = bonusSpinEngine.resolveSpin(true); // isBonusSpin = true
                currentBonusTotalWin += bonusSpinResult.finalTotalWin;
            }

            totalBonusWinAmount += currentBonusTotalWin;
            roundTotalWin += currentBonusTotalWin;
        }

        // --- 3. Update Global Statistics ---
        totalWinAmount += roundTotalWin;
        if (roundTotalWin > 0) {
            totalWins++;
        }
        if (roundTotalWin > maxWin) {
            maxWin = roundTotalWin;
        }

        if ((i + 1) % 100000 === 0) {
            console.log(`... Progress: ${((i + 1) / NUM_ROUNDS * 100).toFixed(0)}%`);
        }
    }
    const endTime = Date.now();

    // --- Final Report ---
    const totalRTP = (totalWinAmount / NUM_ROUNDS) * 100;
    const baseGameRTP = (totalBaseGameWinAmount / NUM_ROUNDS) * 100;
    const bonusGameRTP = (totalBonusWinAmount / NUM_ROUNDS) * 100;
    const hitFrequency = (totalWins / NUM_ROUNDS) * 100;
    const bonusFrequency = bonusTriggers > 0 ? (NUM_ROUNDS / bonusTriggers) : 0;
    const avgBonusWin = bonusTriggers > 0 ? (totalBonusWinAmount / bonusTriggers) : 0;
    const totalDuration = (endTime - startTime) / 1000;

    console.log(`\n--- Simulation Complete: Final Report ---`);
    console.log(`Total Rounds Simulated: ${NUM_ROUNDS} in ${totalDuration.toFixed(2)} seconds`);
    console.log(`\n--- Final Economic & Volatility Analysis ---`);
    console.log(`- Total Return to Player (RTP): ${totalRTP.toFixed(4)}%`);
    console.log(`    - Base Game Contribution: ${baseGameRTP.toFixed(4)}%`);
    console.log(`    - Bonus Game Contribution: ${bonusGameRTP.toFixed(4)}%`);
    console.log(`- Hit Frequency (any win): ${hitFrequency.toFixed(2)}%`);
    console.log(`- Bonus Frequency: 1 in ~${bonusFrequency.toFixed(2)} spins`);
    console.log(`- Average Bonus Win: ${avgBonusWin.toFixed(2)}x`);
    console.log(`- Max Win Recorded: ${maxWin.toFixed(2)}x`);
    console.log(`- Total Bonus Triggers: ${bonusTriggers}`);
    console.log(`------------------------------------\n`);
}

runSimulation();
