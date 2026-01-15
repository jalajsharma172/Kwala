const jobs = require('./jobs');
const stratumV1 = require('./stratum'); // Renamed for clarity, or keep as stratum
const stratumV2 = require('./stratum_v2_translator');
const config = require('../config.json');

async function main() {
    console.log('Starting Axon Pool Server...');
    console.log(`Network: ${config.network}`);

    try {
        // 1. Initialize Job Manager (Connects to RPC, validates address)
        await jobs.init();

        // 2. Start Stratum Servers
        stratumV1.start(); // Port 3333
        stratumV2.start(); // Port 3334

        // 3. Main Loop: Poll for new block templates
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
