import { GameEngine } from './src/GameEngine';
// =================================================================================
// --- Too Many Chefs Volatility Simulation Script ---
// =================================================================================
// This script runs a large number of game rounds to verify the statistical
// outcomes of the core game mechanics, specifically the "Kitchen Chaos"
// collision feature and the Reel 6 multiplier activation.
//
// To Run: You will need a TypeScript runner like ts-node.
// `npx ts-node simulate_volatility.ts`
// =================================================================================
// --- Simulation Configuration ---
const NUM_ROUNDS = 1000;
// --- Statistics Trackers ---
let totalWins = 0; // Rounds that resulted in a win > 0
let kitchenChaosTriggers = 0;
let reel6Activations = 0;
let maxWin = 0;
const engine = new GameEngine();
console.log(`
[1m[34m--- Starting Too Many Chefs Volatility Simulation ---[0m`);
console.log(`[34m--- Running ${NUM_ROUNDS} rounds... ---[0m
`);
// --- Main Simulation Loop ---
for (let i = 0; i < NUM_ROUNDS; i++) {
    // For simulation, clientSeed can be static. Nonce should change for provable fairness checks.
    const result = engine.resolveSpin("simulation-client-seed", i);
    // 1. Track Hit Frequency (any round with a win)
    if (result.finalTotalWin > 0) {
        totalWins++;
    }
    // 2. Track Max Win
    if (result.finalTotalWin > maxWin) {
        maxWin = result.finalTotalWin;
    }
    // 3. Inspect the event sequence for specific feature triggers
    const hasKitchenChaos = result.eventSequence.some(e => e.type === 'COLLISION_BUST' || e.type === 'COLLISION_MERGE');
    const hasReel6 = result.eventSequence.some(e => { var _a; return e.type === 'REEL6_APPLY_MULTIPLIER' && ((_a = e.activeMultiplier) !== null && _a !== void 0 ? _a : 1) > 1; });
    if (hasKitchenChaos) {
        kitchenChaosTriggers++;
        // As requested, log the full round JSON for inspection
        console.log(`
[33m--- KITCHEN CHAOS TRIGGERED (Round ${i + 1}) ---[0m`);
        console.log(JSON.stringify(result, null, 2));
        console.log(`[33m------------------------------------------[0m
`);
    }
    if (hasReel6) {
        reel6Activations++;
    }
}
// --- Final Report ---
console.log(`
[1m[32m--- Simulation Complete: Final Report ---[0m`);
console.log(`[1m[32mTotal Rounds Simulated: ${NUM_ROUNDS}[0m`);
console.log(`
[1m--- Core Gameplay Statistics ---[0m`);
console.log(`[36m- Hit Frequency:[0m ${(totalWins / NUM_ROUNDS * 100).toFixed(2)}% (${totalWins} winning rounds)`);
console.log(`[36m- Kitchen Chaos Rate:[0m ${(kitchenChaosTriggers / NUM_ROUNDS * 100).toFixed(2)}% (${kitchenChaosTriggers} triggers)`);
console.log(`[36m- Reel 6 Activation Rate:[0m ${(reel6Activations / NUM_ROUNDS * 100).toFixed(2)}% (${reel6Activations} activations)`);
console.log(`[36m- Max Win Recorded:[0m ${maxWin}x`);
console.log(`[1m------------------------------------[0m
`);
