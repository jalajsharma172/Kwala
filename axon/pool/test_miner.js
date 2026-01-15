const net = require('net');
const crypto = require('crypto');

const client = new net.Socket();
const config = {
    port: 3333,
    host: '127.0.0.1',
    user: 'miner1',
    pass: 'x'
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

            // Simulate Mining (Submit a Fake Share)
            // We just send random nonce to test "Reject" or "Accept" logic.
            // But we want to test "Accept" ideally.
            // Finding a valid share on Regtest is easy if difficulty is 1.
            // But ShareManager uses difficulty 1 (Pool Target) which is easy-ish?
            // Target: 0x00000000FFFF... (Note: This is actually quite hard for CPU script!)
            // Wait, Standard diff 1 is 0x00000000FFFF... (32 bits zero). ~4 billion hashes.
            // Regtest network target is easier (0x7fffff...)

            // Let's modify ShareManager locally to have EASIER target for testing?
            // Or just try to verify "Invalid Share" is handled correctly first.

            setTimeout(() => {
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
            }, 1000);
        }

        if (msg.id === 4) {
            console.log('Share Result:', msg.result ? 'ACCEPTED' : 'REJECTED', msg.error);
            client.end(); // Close after one attempt
        }
    }
});

client.on('close', () => {
    console.log('Connection closed');
});
