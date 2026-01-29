
// =================================================================================
// --- Core Game Configuration ---
// All magic numbers and central tuning parameters for the game.
// =================================================================================

export const GameConfig = {
    GRID_WIDTH: 5,
    GRID_HEIGHT: 5,
    get GRID_SIZE() { return this.GRID_WIDTH * this.GRID_HEIGHT; },

    // --- Symbol IDs ---
    // Using numbers for efficiency. 0-8 are normal, 9 is wild, 10 is scatter.
    WILD_SYMBOL: 9,
    SCATTER_SYMBOL: 10,

    // --- Win Conditions ---
    MIN_SYMBOLS_FOR_WIN: 3, // The minimum number of identical symbols for a payout.

    // --- Bonus Round ---
    // Defines how many free spins are awarded for N scatter symbols.
    SPINS_PER_SCATTER: {
        3: 5,  // 3 scatters award 5 free spins
        4: 8,  // 4 scatters award 8 free spins
        5: 12  // 5 scatters award 12 free spins
    } as { [key: number]: number },
};

/**
 * The complete set of symbols that can appear on the grid.
 */
export const SYMBOLS = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, // Normal symbols
    GameConfig.WILD_SYMBOL,
    GameConfig.SCATTER_SYMBOL,
];

/**
 * Defines the base payout for each symbol when it forms a winning combination.
 * The final win is this value multiplied by the number of symbols in the win.
 */
export const PAYTABLE = {
    0: 5,   // Symbol 0 pays 5 units per symbol in a win
    1: 5,
    2: 5,
    3: 10,
    4: 10,
    5: 15,
    6: 20,
    7: 30,
    8: 50,  // The highest paying normal symbol
    [GameConfig.WILD_SYMBOL]: 0, // Wilds contribute to wins but have no base value themselves
    [GameConfig.SCATTER_SYMBOL]: 0, // Scatters trigger bonuses, not direct payouts
};
