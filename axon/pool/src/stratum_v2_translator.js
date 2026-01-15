const net = require('net');
const config = require('../config.json');
const jobApi = require('./job_api');

/**
 * Stratum V2 Translator
 * 
 * Simulates SV2 protocol messages over TCP with JSON encoding (for MVP).
 * Maps SV2 concepts (Channels, Job Negotiations) to simplified JobAPI calls.
 */
class StratumV2Translator {
    constructor() {
        this.miners = [];
        this.server = net.createServer(this.handleConnection.bind(this));
    }

    start() {
        const port = 3334; // SV2 port
        this.server.listen(port, () => {
            console.log(`Stratum V2 Translator listening on port ${port}`);
        });
    }

    handleConnection(socket) {
        socket.setKeepAlive(true);
        socket.setEncoding('utf8');

        const miner = {
            socket: socket,
            ip: socket.remoteAddress,
            authorized: false,
            apiMinerId: null,
            extraNonce1: null,
            // SV2 Specific
            protocolAttributes: null,
            channelId: null
        };

        this.miners.push(miner);
        console.log(`SV2 Miner connected: ${miner.ip}`);

        let buffer = '';
        socket.on('data', (data) => {
            buffer += data;
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const req = JSON.parse(line);
                    this.handleRequest(miner, req);
                } catch (e) {
                    console.error('SV2 Invalid JSON:', line);
                    socket.destroy();
                }
            }
        });

        socket.on('end', () => {
            console.log(`SV2 Miner disconnected: ${miner.ip}`);
            this.removeMiner(miner);
        });

        socket.on('error', (err) => {
            console.error(`SV2 Miner error ${miner.ip}:`, err.message);
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
        // SV2 Method simulation
        try {
            switch (req.method) {
                case 'setup_connection':
                    response = this.handleSetupConnection(miner, req);
                    break;
                case 'channel_endpoint_add': // Auth / Open Channel
                    response = this.handleChannelEndpointAdd(miner, req);
                    break;
                case 'mining.submit_share':
                    response = this.handleSubmitShare(miner, req);
                    break;
                default:
                    response = { method: req.method, error: 'Unknown method' };
            }
        } catch (e) {
            console.error('SV2 Request processing error:', e);
            response = { method: req.method, error: 'Internal Error' };
        }

        if (response) {
            // SV2 is usually request-response or notification based.
            // We simulate response structure.
            miner.socket.write(JSON.stringify(response) + '\n');
        }
    }

    handleSetupConnection(miner, req) {
        // params: protocol, min_version, max_version, flags, endpoint_host, endpoint_port, vendor, hardware_version, firmware, device_id...
        // We just return success.
        miner.protocolAttributes = req.params;
        return {
            method: 'setup_connection.result',
            flags: 0, // 
            used_version: 2
        };
    }

    handleChannelEndpointAdd(miner, req) {
        // params: channel_id, username, password... (Simulated)
        // SV2 actually has `open_standard_mining_channel`.
        // Let's assume the simulated client sends "username" here.

        const username = req.params.username || "unknown";
        const solanaAddress = req.params.solana_address || null;

        // 1. Register with JobAPI
        const result = jobApi.registerMiner({
            transport: 'stratum_v2',
            ip: miner.ip,
            solanaAddress: solanaAddress
        });
        miner.apiMinerId = result.minerId;
        miner.extraNonce1 = result.extraNonce1;
        miner.channelId = result.minerId; // Use minerID as ChannelID for simplicity

        // 2. Authorize
        const auth = jobApi.authorizeMiner(miner.apiMinerId, username, 'x'); // Pass dummy password
        miner.authorized = auth;

        console.log(`SV2 Miner Authorized: ${username} (Channel: ${miner.channelId})`);

        // Send Current Job Immediately
        const currentJob = jobApi.getJobForMiner(miner.apiMinerId);
        if (currentJob) {
            this.sendJobToMiner(miner, currentJob);
        }

        return {
            method: 'channel_endpoint_add.result', // or open_standard_mining_channel.result
            channel_id: miner.channelId,
            request_id: req.id,
            status: 'success'
        };
    }

    sendJobToMiner(miner, job) {
        const notify = {
            method: 'mining.set_new_prev_hash',
            params: {
                job_id: job.jobId,
                prev_hash: job.previousHash,
                coinbase_part1: job.coinbase1,
                coinbase_part2: job.coinbase2,
                merkle_branch: job.merkleBranch,
                version: job.version,
                nbits: job.nBits,
                ntime: job.nTime,
                clean_jobs: true
            }
        };
        miner.socket.write(JSON.stringify(notify) + '\n');
    }

    handleSubmitShare(miner, req) {
        // params: channel_id, job_id, nonce, ntime, version, en2...
        // SV2 submit is different: channel_id, sequence_number, ... ?
        // We simulate a clean JSON payload: { jobId, nonce, nTime, extraNonce2 }

        if (!miner.authorized) {
            return { method: 'mining.submit_share.result', error: 'Unauthorized' };
        }

        // Mapping params from simulated SV2 to JobAPI
        // Expecting: params = { jobId, nonce, nTime, extraNonce2 }
        const { jobId, nonce, nTime, extraNonce2 } = req.params;

        // Convert nTime to Hex String if it is a number
        const nTimeHex = typeof nTime === 'number' ? nTime.toString(16) : nTime;

        const submission = {
            jobId,
            extraNonce2,
            nTime: nTimeHex,
            nonce
        };

        const apiResult = jobApi.submitShareFromTransport(miner.apiMinerId, submission);

        return {
            method: 'mining.submit_share.result',
            status: apiResult.valid ? 'accepted' : 'rejected',
            error: apiResult.error
        };
    }

    broadcastJob(job) {
        if (!job) return;

        // SV2 Job: `mining.set_new_prev_hash` (New Block) or `mining.set_custom_mining_job`?
        // Usually `set_new_prev_hash` updates the chain state.
        // `open_standard_mining_channel` success usually gives the first job?
        // For MVP, we send `mining.set_new_prev_hash` to tell miners "New Job/Block".

        // Map JobAPI job to SV2 structure
        // params: channel_id, job_id, prev_hash, min_ntime, nbits, coinbase_prefix, coinbase_suffix, ...
        // Simplified JSON:

        const notify = {
            method: 'mining.set_new_prev_hash',
            params: {
                job_id: job.jobId,
                prev_hash: job.previousHash,
                coinbase_part1: job.coinbase1,
                coinbase_part2: job.coinbase2,
                merkle_branch: job.merkleBranch,
                version: job.version,
                nbits: job.nBits,
                ntime: job.nTime,
                clean_jobs: true
            }
        };

        const line = JSON.stringify(notify) + '\n';
        for (const m of this.miners) {
            if (m.authorized) {
                m.socket.write(line);
            }
        }
    }
}

module.exports = new StratumV2Translator();
