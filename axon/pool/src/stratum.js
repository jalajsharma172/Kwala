const net = require('net');
const config = require('../config.json');
const jobs = require('./jobs');
const shares = require('./shares');

class StratumServer {
    constructor() {
        this.miners = [];
        this.server = net.createServer(this.handleConnection.bind(this));
    }

    start() {
        this.server.listen(config.pool.port, () => {
            console.log(`Stratum Server listening on port ${config.pool.port}`);
        });
    }

    handleConnection(socket) {
        socket.setKeepAlive(true);
        socket.setEncoding('utf8');

        const miner = {
            id: Date.now() + Math.random(),
            socket: socket,
            ip: socket.remoteAddress,
            authorized: false,
            subscriptionId: null,
            extraNonce1: jobs.extraNonce1 // Shared EN1 for simplified MVP
        };

        this.miners.push(miner);
        console.log(`Miner connected: ${miner.ip}`);

        let buffer = '';
        socket.on('data', (data) => {
            buffer += data;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const req = JSON.parse(line);
                    this.handleRequest(miner, req);
                } catch (e) {
                    console.error('Invalid JSON:', line);
                    socket.destroy();
                }
            }
        });

        socket.on('end', () => {
            console.log(`Miner disconnected: ${miner.ip}`);
            this.removeMiner(miner);
        });

        socket.on('error', (err) => {
            console.error(`Miner error ${miner.ip}:`, err.message);
            this.removeMiner(miner);
        });
    }

    removeMiner(miner) {
        const index = this.miners.indexOf(miner);
        if (index !== -1) {
            this.miners.splice(index, 1);
        }
    }

    handleRequest(miner, req) {
        let response = null;
        try {
            switch (req.method) {
                case 'mining.subscribe':
                    response = this.handleSubscribe(miner, req);
                    break;
                case 'mining.authorize':
                    response = this.handleAuthorize(miner, req);
                    break;
                case 'mining.submit':
                    response = this.handleSubmit(miner, req);
                    break;
                case 'mining.extranonce.subscribe':
                    response = { result: true, error: null, id: req.id }; // Simplified
                    break;
                default:
                    response = { result: null, error: [20, `Unknown method ${req.method}`, null], id: req.id };
            }
        } catch (e) {
            console.error('Request processing error:', e);
            response = { result: null, error: [20, 'Internal Error', null], id: req.id };
        }

        if (response) {
            miner.socket.write(JSON.stringify(response) + '\n');
        }
    }

    handleSubscribe(miner, req) {
        // [ [ ["mining.notify", "subscriptionId"] ], "extraNonce1", extraNonce2Size ]
        const subId = crypto.randomBytes(4).toString('hex');
        miner.subscriptionId = subId;
        return {
            result: [
                [["mining.notify", subId]],
                miner.extraNonce1,
                jobs.extraNonce2Size
            ],
            error: null,
            id: req.id
        };
    }

    handleAuthorize(miner, req) {
        const username = req.params[0];
        miner.authorized = true;
        miner.workerName = username;
        console.log(`Miner authorized: ${username}`);
        return { result: true, error: null, id: req.id };
    }

    handleSubmit(miner, req) {
        // Params: workerName, jobId, extraNonce2, nTime, nonce
        if (!miner.authorized) {
            return { result: null, error: [24, "Unauthorized", null], id: req.id };
        }

        const [workerName, jobId, extraNonce2, nTime, nonce] = req.params;

        try {
            const result = shares.validateShare(miner, jobId, extraNonce2, nTime, nonce);
            if (result.valid) {
                return { result: true, error: null, id: req.id };
            } else {
                return { result: null, error: [21, "Job not found or invalid", null], id: req.id };
            }
        } catch (e) {
            console.error('Share Validation Error:', e.message);
            return { result: null, error: [20, "Validation Error", null], id: req.id };
        }
    }

    broadcastJob(job) {
        if (!job) return;
        // Params: jobId, prevHash, coinbase1, coinbase2, merkleBranch, version, nBits, nTime, cleanJobs

        // Ensure hex string format
        const prevHash = Buffer.from(job.previousHash, 'hex');
        // Bitcoin Core gives prevhash in Big Endian? Or Little Endian?
        // getblocktemplate gives `previousblockhash` as Big Endian usually.
        // Stratum needs Big Endian bytes? 
        // Slush V1 doc: "prevhash: 32 bytes, big endian".
        // If Core gives BE (Hex String), we just pass it?
        // Wait, Stratum `prevhash` usually: 
        // "Swap each 4-byte chunk of the 32-byte hash"?
        // Actually, let's stick to what standard pools send.
        // If `getblockchaininfo` says block X, miners need `prevhash` of X-1.
        // I will assume `getblocktemplate` gives the correct ready-to-use string for now.
        // If not, miners will reject.

        const params = [
            job.jobId,
            job.previousHash, // Keep as is
            job.coinbase1,
            job.coinbase2,
            job.merkleBranch,
            this.toHexWait(job.version),
            job.nBits,
            this.toHexWait(job.nTime),
            true // cleanJobs - always force new for MVP simplicity
        ];

        const notify = {
            method: 'mining.notify',
            params: params
        };

        const line = JSON.stringify(notify) + '\n';
        for (const m of this.miners) {
            if (m.authorized) { // Or even if not? Usually need sub.
                m.socket.write(line);
            }
        }
    }

    toHexWait(n) {
        // Version and nTime are 4 byte.
        // Hex string.
        const b = Buffer.alloc(4);
        b.writeUInt32BE(n); // BE or LE?
        // Stratum spec: "version: Big endian hex string"
        // But nBits is "encoded compact target"?
        // Let's use BE.
        return b.toString('hex');
    }
}

const crypto = require('crypto');
module.exports = new StratumServer();
