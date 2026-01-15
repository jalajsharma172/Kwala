const net = require('net');
const crypto = require('crypto');

const config = {
    port: 3334,
    host: '127.0.0.1',
    user: 'minerV2',
    pass: 'x'
};

const client = new net.Socket();
let channelId = null;
let jobId = null;
let extraNonce2 = '00000000'; // 4 bytes hex

client.connect(config.port, config.host, () => {
    console.log('SV2 Client Connected');

    // 1. Setup Connection
    const setup = {
        method: 'setup_connection',
        params: { protocol: 2, min_version: 2 }
    };
    client.write(JSON.stringify(setup) + '\n');
});

client.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
        if (!line.trim()) continue;
        console.log('Pool (SV2):', line);

        // Handle SV2 logic
        let msg;
        try { msg = JSON.parse(line); } catch (e) { continue; }

        if (msg.method === 'setup_connection.result') {
            console.log('SV2 Handshake Success');
            // 2. Open Channel (Auth)
            const open = {
                method: 'channel_endpoint_add',
                params: {
                    username: config.user,
                    solana_address: 'SolanaMinerWallet123'
                }
            };
            client.write(JSON.stringify(open) + '\n');
        }
        else if (msg.method === 'channel_endpoint_add.result') {
            console.log('SV2 Channel Opened:', msg.channel_id);
            channelId = msg.channel_id;
        }
        else if (msg.method === 'mining.set_new_prev_hash') {
            console.log('New Job Received (SV2):', msg.params.job_id);
            jobId = msg.params.job_id;
            const nTime = msg.params.ntime;

            // Simulate Mining
            setTimeout(() => {
                const submit = {
                    method: 'mining.submit_share',
                    params: {
                        jobId: jobId,
                        nonce: 'deadbeef',
                        nTime: nTime,
                        extraNonce2: extraNonce2
                    }
                };
                console.log('Submitting SV2 share...');
                client.write(JSON.stringify(submit) + '\n');
            }, 1500);
        }
        else if (msg.method === 'mining.submit_share.result') {
            console.log('SV2 Share Result:', msg.status, msg.error || '');
            if (msg.status === 'accepted') {
                // Success
                client.end();
            }
        }
    }
});

client.on('close', () => {
    console.log('SV2 Connection Closed');
});
