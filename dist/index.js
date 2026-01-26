"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.playRound = void 0;
const functions = __importStar(require("firebase-functions"));
const GameEngine_1 = require("./GameEngine");
// Initialize Firebase Admin SDK if you need to interact with other Firebase services.
// import * as admin from 'firebase-admin';
// admin.initializeApp();
/**
 * The main Cloud Function to handle a single game round.
 *
 * @param {object} data - The request data, containing clientSeed and nonce.
 * @param {functions.https.CallableContext} context - The context of the function call.
 * @returns {RoundResult} The complete result of the game round.
 */
exports.playRound = functions.https.onCall((data, context) => {
    // Ensure the user is authenticated if required, e.g., for Stake.com integration.
    // if (!context.auth) {
    //     throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    // }
    const { clientSeed, nonce } = data;
    if (typeof clientSeed !== 'string' || typeof nonce !== 'number') {
        throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a string "clientSeed" and a number "nonce".');
    }
    try {
        const engine = new GameEngine_1.GameEngine();
        const result = engine.resolveSpin(clientSeed, nonce);
        return result;
    }
    catch (error) {
        // Log the error for debugging purposes.
        console.error('An error occurred in the GameEngine:', error);
        // Throw a generic error to the client to avoid leaking implementation details.
        throw new functions.https.HttpsError('internal', 'An internal error occurred while processing the game round.');
    }
});
