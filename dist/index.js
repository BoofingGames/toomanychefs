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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto = __importStar(require("crypto"));
const admin = __importStar(require("firebase-admin"));
const GameEngine_1 = require("./GameEngine");
const dataconnect_admin_generated_1 = require("./dataconnect-admin-generated");
const data_connect_1 = require("firebase-admin/data-connect");
admin.initializeApp();
const app = (0, express_1.default)();
const dc = (0, data_connect_1.getDataConnect)(dataconnect_admin_generated_1.connectorConfig);
// Middleware
app.use(express_1.default.static('public'));
app.use(express_1.default.json());
// API route for the game
app.post('/api/spin', (req, res) => {
    console.log("Spin request received", { body: req.body });
    const { clientSeed, nonce } = req.body;
    if (clientSeed === undefined || nonce === undefined) {
        console.error("Bad request: clientSeed or nonce missing");
        return res.status(400).send({ error: 'clientSeed and nonce are required.' });
    }
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const engine = new GameEngine_1.GameEngine(serverSeed, clientSeed, nonce);
    const result = engine.resolveSpin();
    // Combine the engine result with the server seed for the response
    return res.json(Object.assign(Object.assign({}, result), { serverSeed: serverSeed }));
});
app.get("/api/movies", async (req, res) => {
    const result = await (0, dataconnect_admin_generated_1.listMovies)(dc);
    return res.json(result.data.movies);
});
// Serve the main page
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});
// Start the server for App Hosting
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
//# sourceMappingURL=index.js.map