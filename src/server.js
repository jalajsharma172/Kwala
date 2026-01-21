const jobs = require('./jobs');
const shares = require('./shares');
const stratumV1 = require('./stratum'); // Renamed for clarity, or keep as stratum
const stratumV2 = require('./stratum_v2_translator');
const solanaBridge = require('./solana_bridge');
const config = require('../config.json');
const express = require('express');
const cors = require('cors');

async function main() {
    console.log('Starting Axon Pool Server...');
    console.log(`Network: ${config.network}`);

    try {
        // 1. Initialize Solana Bridge (Connect to Devnet)
        await solanaBridge.init();

        // 1.5 Initialize Database
        const db = require('./database');
        await db.init();

        // 2. Initialize Job Manager (Connects to RPC, validates address)
        try {
            await jobs.init();
            await shares.init(); // Load historical shares
        } catch (jobErr) {
            console.error("⚠️ [JobManager] Init Failed (Bitcoin RPC likely down). Mining disabled.");
            console.error(jobErr.message);
            // proceed anyway so API works
        }

        // 3. Start Stratum Servers
        try {
            stratumV1.start(); // Port 3333
            stratumV2.start(); // Port 3334
        } catch (stratumErr) {
            console.error("⚠️ [Stratum] Start Failed:", stratumErr.message);
        }

        // 4. Start API Server
        const app = express();
        app.use(cors());
        app.use(express.json());

        app.post('/api/mint', async (req, res) => {
            const { address, amount } = req.body;

            if (!address) {
                return res.status(400).json({ error: "Missing address" });
            }

            try {
                // Default to 1 if not specified
                const mintAmount = amount || 1;

                // Call the bridge to mint (server holds the authority key)
                const signature = await solanaBridge.mintZBTC(address, mintAmount);

                res.json({ success: true, signature });
            } catch (e) {
                console.error("Mint API Error:", e);
                res.status(500).json({ error: e.message });
            }
        });

        app.get('/api/stats', (req, res) => {
            const currentJob = jobs.currentJob || {};
            res.json({
                miners: stratumV1.miners.length + stratumV2.miners.length,
                hashrate: shares.getPoolHashrate(),
                blockHeight: currentJob.height || 0,
                lastJobId: currentJob.jobId || null,
                network: config.network,
                poolAddress: config.pool.address,
                solanaEnabled: solanaBridge.enabled,
                solanaPayouts: 0 // TODO: Track in Rewards
            });
        });

        // New Route: Miner Stats API (JSON)
        app.get('/api/miner/:id', async (req, res) => {
            const minerId = req.params.id;
            try {
                // Initialize DB if not already (it is at start, but good safety)

                // Get Stats
                const db = require('./database');
                const stats = await db.getMinerStats(minerId);

                res.json(stats);
            } catch (e) {
                console.error("Miner Stats Error:", e);
                res.status(500).json({ error: "Error fetching miner stats" });
            }
        });

        const API_PORT = 3001;
        app.listen(API_PORT, () => {
            console.log(`API Server listening on port ${API_PORT}`);
        });

        // 5. Main Loop: Poll for new block templates
        console.log('Starting Block Template Polling...');

        const POLLING_INTERVAL = 1000; // 1 second for Regtest/Testnet

        while (true) {
            try {
                const newJob = await jobs.updateBlockTemplate();
                if (newJob) {
                    // New Block detected or first job
                    console.log(`Broadcasting Job: ${newJob.jobId}`);
                    stratumV1.broadcastJob(newJob);
                    stratumV2.broadcastJob(newJob);
                }
            } catch (e) {
                console.error('Error in main polling loop:', e);
            }

            await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        }

    } catch (e) {
        console.error('Fatal Error:', e);
        process.exit(1);
    }
}

main();
