
console.log("Starting server...");
import express, { Request, Response } from 'express';
console.log("Imported express");
import * as crypto from 'crypto';
console.log("Imported crypto");
import * as admin from 'firebase-admin';
console.log("Imported firebase-admin");
import { GameEngine } from './GameEngine';
console.log("Imported GameEngine");
import { listMovies, connectorConfig } from "./dataconnect-admin-generated";
console.log("Imported dataconnect-admin-generated");
import { getDataConnect } from "firebase-admin/data-connect";
console.log("Imported firebase-admin/data-connect");

try {
    console.log("Initializing Firebase Admin SDK...");
    admin.initializeApp();
    console.log("Firebase Admin SDK initialized.");
} catch (e) {
    console.error("Error initializing Firebase Admin SDK:", e);
    process.exit(1);
}

const app = express();
console.log("Created express app.");

let dc;
try {
    console.log("Getting Data Connect instance...");
    dc = getDataConnect(connectorConfig);
    console.log("Data Connect instance obtained.");
} catch (e) {
    console.error("Error getting Data Connect instance:", e);
    process.exit(1);
}


// Middleware
console.log("Configuring middleware...");
app.use(express.static('public'));
app.use(express.json());
console.log("Middleware configured.");

// API route for the game
console.log("Configuring API routes...");
app.post('/api/spin', (req: Request, res: Response) => {
    console.log("Spin request received", { body: req.body });
    const { clientSeed, nonce } = req.body;

    if (clientSeed === undefined || nonce === undefined) {
        console.error("Bad request: clientSeed or nonce missing");
        return res.status(400).send({ error: 'clientSeed and nonce are required.' });
    }

    const serverSeed = crypto.randomBytes(32).toString('hex');
    const engine = new GameEngine(serverSeed, clientSeed, nonce);
    const result = engine.resolveSpin();
    return res.json(result);
});

app.get("/api/movies", async (req: Request, res: Response) => {
  const result = await listMovies(dc);
  return res.json(result.data.movies);
});
console.log("API routes configured.");

// Serve the main page
console.log("Configuring main page route...");
app.get('/', (req: Request, res: Response) => {
    res.sendFile('index.html', { root: 'public' });
});
console.log("Main page route configured.");

// Start the server for App Hosting
const port = process.env.PORT || 8080;
console.log(`Starting server on port ${port}...`);
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
