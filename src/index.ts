
import express, { Request, Response } from 'express';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import * as path from 'path';
import { GameEngine } from './GameEngine';
import { listMovies, connectorConfig } from "./dataconnect-admin-generated";
import { getDataConnect } from "firebase-admin/data-connect";

admin.initializeApp();

const app = express();
const dc = getDataConnect(connectorConfig);

const publicDir = path.join(__dirname, 'public');

// Middleware
app.use(express.static(publicDir));
app.use(express.json());

// API route for the game
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

// Serve the main page
app.get('/', (req: Request, res: Response) => {
    res.sendFile('index.html', { root: publicDir });
});

// Start the server for App Hosting
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
