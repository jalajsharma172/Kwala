const net = require('net');
const crypto = require('crypto');

const client = new net.Socket();
const config = {
    port: 3333,
    host: '127.0.0.1',
    user: 'miner1',
    // Use a Random or Pool Address for testing
    // We'll use a hardcoded valid Devnet address here for verification
    pass: 'x,solanaAddress=C7U4EaBhqxswvihnr6zjFUsy57qvDNYpsboCLHAbBRtC'
};

let subscriptionId = null;
let extraNonce1 = null;
let extraNonce2Size = 4;
let jobId = null;
let extraNonce2 = '00000000'; // 4 bytes hex
let nTime = null;

client.connect(config.port, config.host, () => {
    console.log('Connected to Pool');

    // 1. Subscribe
    const subReq = {
        id: 1,
        method: 'mining.subscribe',
        params: ["TestMiner/1.0.0"]
    };
    client.write(JSON.stringify(subReq) + '\n');
});

client.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        console.log('Pool:', line);

        const msg = JSON.parse(line);

        // Handle Responses
        if (msg.id === 1) { // Subscribe
            console.log('Subscribed!');
            subscriptionId = msg.result[0][0][1];
            extraNonce1 = msg.result[1];
            extraNonce2Size = msg.result[2];

            // 2. Authorize
            const authReq = {
                id: 2,
                method: 'mining.authorize',
                params: [config.user, config.pass]
            };
            client.write(JSON.stringify(authReq) + '\n');
        }
        else if (msg.id === 2) { // Authorize
            console.log('Authorized!');
        }

        // Handle Notifications
        if (msg.method === 'mining.notify') {
            // params: jobId, prevHash, coinb1, coinb2, merkle, ver, nbits, ntime, clean
            console.log('New Job Received:', msg.params[0]);
            jobId = msg.params[0];
            const nTimeRaw = msg.params[7]; // Hex string
            nTime = nTimeRaw;

            // Start mining loop if not already started
            if (!this.miningInterval) {
                this.miningInterval = setInterval(() => {
                    const submitReq = {
                        id: 4,
                        method: 'mining.submit',
                        params: [
                            config.user,
                            jobId,
                            extraNonce2,
                            nTime,
                            "00000000" // Nonce
                        ]
                    };
                    console.log('Submitting share...');
                    client.write(JSON.stringify(submitReq) + '\n');
                }, 2000); // Send share every 2 seconds
            }
        }

        if (msg.id === 4) {
            console.log('Share Result:', msg.result ? 'ACCEPTED' : 'REJECTED', msg.error);
            // client.end(); // DO NOT CLOSE
        }
    }
});

client.on('close', () => {
    console.log('Connection closed');
});
