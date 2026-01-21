const net = require('net');
const config = require('../config.json');
const jobApi = require('./job_api');

class StratumServer {
    constructor() {
        this.miners = [];
        this.server = net.createServer(this.handleConnection.bind(this));
    }

    start() {
        this.server.listen(config.pool.port, () => {
            console.log(`Stratum Server listening on port ${config.pool.port} (${config.network})`);
        });
    }

    handleConnection(socket) {
        socket.setKeepAlive(true);
        socket.setEncoding('utf8');

        const miner = {
            socket: socket,
            ip: socket.remoteAddress,
            authorized: false,
            subscriptionId: null,
            apiMinerId: null, // ID from JobAPI
            extraNonce1: null // Assigned by JobAPI
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
        // Cleanup JobAPI state
        if (miner.apiMinerId) {
            jobApi.removeMiner(miner.apiMinerId);
        }

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
        // Call JobAPI
        const result = jobApi.registerMiner({ transport: 'stratum_v1', ip: miner.ip });

        miner.apiMinerId = result.minerId;
        miner.extraNonce1 = result.extraNonce1;

        // Subscription ID can optionally come from API or just local unique
        // Stratum V1 usually uses a session ID.
        miner.subscriptionId = result.minerId; // Use minerId as SubId

        return {
            result: [
                [["mining.notify", miner.subscriptionId]],
                miner.extraNonce1,
                result.extraNonce2Size
            ],
            error: null,
            id: req.id
        };
    }

    handleAuthorize(miner, req) {
        const username = req.params[0];
        const password = req.params[1];
        const success = jobApi.authorizeMiner(miner.apiMinerId, username, password);

        miner.authorized = success;
        miner.username = username; // Store for stats
        console.log(`Miner authorized: ${username} (ID: ${miner.apiMinerId})`);

        // Send Difficulty (Required by most miners)
        // Difficulty 1 = Target 00000000FFFF.... (Standard)
        // Since we set poolTarget to ALL Fs (Max), that is Diff ~0.000000001 (It's effectively 1/2^32 if we consider standard diff 1 as 2^32 works)
        // Actually, Difficulty 1 usually corresponds to a high target (0x00000000FFFF0000000000000000000000000000000000000000000000000000)
        // Our pool target is *even easier* (starts with F after my change). 
        // Let's send a very small difficulty or just 1.

        miner.authorized = success;
        console.log(`Miner authorized: ${username} (ID: ${miner.apiMinerId})`);

        // Send Success FIRST (by returning it, the caller writes it)
        // We use setImmediate to send the rest AFTER the response is written to the socket.
        setImmediate(() => {
            if (!miner.socket.writable) return;

            // Send Low Difficulty for CPU Miners
            const difficulty = 0.0001;
            const diffNotify = {
                id: null,
                method: 'mining.set_difficulty',
                params: [difficulty]
            };
            miner.socket.write(JSON.stringify(diffNotify) + '\n');

            // Send Current Job
            const currentJob = jobApi.getJobForMiner(miner.apiMinerId);
            if (currentJob) {
                this.sendJobToMiner(miner, currentJob);
            }
        });

        return { result: true, error: null, id: req.id };
    }

    sendJobToMiner(miner, job) {
        const params = [
            job.jobId,
            job.previousHash,
            job.coinbase1,
            job.coinbase2,
            job.merkleBranch,
            this.toHexWait(job.version),
            job.nBits,
            this.toHexWait(job.nTime),
            true
        ];

        const notify = {
            method: 'mining.notify',
            params: params
        };
        miner.socket.write(JSON.stringify(notify) + '\n');
    }

    handleSubmit(miner, req) {
        // Params: workerName, jobId, extraNonce2, nTime, nonce
        if (!miner.authorized) {
            return { result: null, error: [24, "Unauthorized", null], id: req.id };
        }

        const [workerName, jobId, extraNonce2, nTime, nonce] = req.params;

        // Call JobAPI
        const submission = {
            jobId,
            extraNonce2,
            nTime,
            nonce
        };

        try {
            const apiResult = jobApi.submitShareFromTransport(miner.apiMinerId, submission);
            if (apiResult.valid) {
                return { result: true, error: null, id: req.id };
            } else {
                return { result: null, error: [21, apiResult.error || "Invalid Share", null], id: req.id };
            }
        } catch (e) {
            console.error('Share Validation Error:', e.message);
            return { result: null, error: [20, "Validation Error", null], id: req.id };
        }
    }

    broadcastJob(job) {
        if (!job) return;

        // Ensure hex string format
        const params = [
            job.jobId,
            job.previousHash,
            job.coinbase1,
            job.coinbase2,
            job.merkleBranch,
            this.toHexWait(job.version),
            job.nBits,
            this.toHexWait(job.nTime),
            true
        ];

        const notify = {
            method: 'mining.notify',
            params: params
        };

        const line = JSON.stringify(notify) + '\n';
        for (const m of this.miners) {
            if (m.authorized) {
                m.socket.write(line);
            }
        }
    }

    toHexWait(n) {
        // Version and nTime are 4 byte.
        const b = Buffer.alloc(4);
        b.writeUInt32BE(n);
        return b.toString('hex');
    }
}

const crypto = require('crypto');
module.exports = new StratumServer();
