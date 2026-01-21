const crypto = require('crypto');
const BigNumber = require('bignumber.js');
const jobs = require('./jobs');
const rpc = require('./rpc');
const rewards = require('./rewards');
const config = require('../config.json');
const db = require('./database');

class ShareManager {
    constructor() {
        // Pool Difficulty (Static for now)
        // We set this VERY EASY so cpu miners submit shares frequently for hashrate tracking.
        // Target: FFFFF... (Difficulty 1 - Easiest)
        this.poolTarget = new BigNumber('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 16);

        // Hashrate Tracking: minerId -> Array of timestamps
        this.minerShares = {};
    }

    async init() {
        // Load recent shares from DB (last 10 mins) to restore hashrate
        try {
            const tenMinsAgo = Date.now() - (10 * 60 * 1000);
            const rows = await db.all('SELECT minerId, timestamp FROM shares WHERE timestamp > ?', [tenMinsAgo]);
            console.log(`[ShareManager] Loaded ${rows.length} recent shares from DB.`);

            for (const row of rows) {
                if (!this.minerShares[row.minerId]) {
                    this.minerShares[row.minerId] = [];
                }
                this.minerShares[row.minerId].push(row.timestamp);
            }
        } catch (e) {
            console.error("Failed to load recent shares:", e);
        }
    }

    getPoolHashrate() {
        // 1. Cleanup old shares (keep last 10 mins)
        const now = Date.now();
        const windowMs = 10 * 60 * 1000;

        // Cleanup and calculate total raw hashrate
        let totalHashrate = new BigNumber(0);

        for (const minerId in this.minerShares) {
            // Filter old shares for this miner
            this.minerShares[minerId] = this.minerShares[minerId].filter(t => now - t < windowMs);

            // If no shares left, optionally remove miner entry (or keep for history)
            if (this.minerShares[minerId].length === 0) continue;

            const minerRate = this.calculateMinerHashrate(minerId, now);
            totalHashrate = totalHashrate.plus(minerRate);
        }

        // Format
        if (totalHashrate.lt(1000)) return `${totalHashrate.toFixed(0)} H/s`;
        if (totalHashrate.lt(1000000)) return `${totalHashrate.dividedBy(1000).toFixed(2)} KH/s`;
        if (totalHashrate.lt(1000000000)) return `${totalHashrate.dividedBy(1000000).toFixed(2)} MH/s`;
        return `${totalHashrate.dividedBy(1000000000).toFixed(2)} GH/s`;
    }

    calculateMinerHashrate(minerId, now = Date.now()) {
        const shares = this.minerShares[minerId] || [];
        if (shares.length < 2) return new BigNumber(0);

        // Use a shorter window for "Instant" hashrate display, e.g., last 1 minute
        // But if shares are sparse, we might need a sliding window. 
        // Let's use the actual time range of the recent shares for better accuracy per miner.

        const instantWindowMs = 60 * 1000;
        const recentShares = shares.filter(t => now - t < instantWindowMs);

        if (recentShares.length === 0) return new BigNumber(0);

        // Hashrate = (Shares * DifficultyOfShare * 2^32?) 
        // Actually: Hashrate = (Count * D * 2^32) / Time
        // BUT our poolTarget is fixed.
        // HashesPerShare = 2^256 / Target

        const target = this.poolTarget;
        const totalSpace = new BigNumber(2).pow(256);
        const hashesPerShare = totalSpace.dividedBy(target);

        const totalHashes = new BigNumber(recentShares.length).multipliedBy(hashesPerShare);

        // Time span: Max(60s, or actual time between first and last share if > 60?)
        // Standard approach: Count / WindowSize.
        // If we filter by 60s, divide by 60s.

        return totalHashes.dividedBy(60);
    }

    validateShare(miner, jobId, extraNonce2, nTime, nonce) {
        const job = jobs.jobs[jobId];
        if (!job) {
            console.log(`Job not found: ${jobId}`);
            return { valid: false };
        }

        // 1. Reconstruct Coinbase
        // Coinbase = cb1 + en1 + en2 + cb2
        const coinbaseHex = job.coinbase1 + miner.extraNonce1 + extraNonce2 + job.coinbase2;
        const coinbaseBuffer = Buffer.from(coinbaseHex, 'hex');

        // 2. Calculate Merkle Root
        const coinbaseHash = this.doubleSha256(coinbaseBuffer);

        let merkleRoot = coinbaseHash;
        for (const branchStepHex of job.merkleBranch) {
            const branchStep = Buffer.from(branchStepHex, 'hex');
            merkleRoot = this.doubleSha256(Buffer.concat([merkleRoot, branchStep]));
        }

        // 3. Construct Block Header
        const versionBuf = Buffer.alloc(4);
        versionBuf.writeUInt32LE(job.version);
        const prevHashBuf = Buffer.from(job.previousHash, 'hex').reverse();
        const timeBuf = Buffer.alloc(4);
        timeBuf.writeUInt32LE(parseInt(nTime, 16));
        const bitsBuf = Buffer.from(job.nBits, 'hex').reverse();
        const nonceBuf = Buffer.alloc(4);
        nonceBuf.writeUInt32LE(parseInt(nonce, 16));

        const header = Buffer.concat([
            versionBuf,
            prevHashBuf,
            merkleRoot,
            timeBuf,
            bitsBuf,
            nonceBuf
        ]);

        if (header.length !== 80) {
            console.error(`Header construction failed. Length: ${header.length}`);
            return { valid: false };
        }

        // 4. Hash Header
        const blockHash = this.doubleSha256(header);
        const blockHashHex = blockHash.reverse().toString('hex'); // BE for display/comparison
        const hashNum = new BigNumber(blockHashHex, 16);

        // 5. Check Pool Target
        const isShareValid = hashNum.lte(this.poolTarget);
        if (!isShareValid) {
            console.log(`Share invalid: ${blockHashHex}`);
            return { valid: false };
        }

        // Log Share per Miner
        // Prioritize wallet (username) if available
        const minerId = miner.wallet || miner.username || miner.apiMinerId || miner.id || "unknown";
        if (!this.minerShares[minerId]) {
            this.minerShares[minerId] = [];
        }
        this.minerShares[minerId].push(Date.now());

        // Log to DB
        db.addShare(minerId, jobId, 1.0).catch(err => console.error("DB Share Error:", err)); // Assuming diff 1 for now

        rewards.addShare(minerId);


        // 6. Check Network Target (Block Found!)
        const networkTarget = new BigNumber(job.target, 16);
        const isBlock = hashNum.lte(networkTarget);

        if (isBlock) {
            console.log(`BLOCK FOUND! Hash: ${blockHashHex}`);
            this.submitBlock(header, coinbaseHex, job.transactions);
            rewards.handleBlockFound(miner.wallet || minerId, 50, 0);
        }

        return { valid: true };
    }

    doubleSha256(buf) {
        const h1 = crypto.createHash('sha256').update(buf).digest();
        return crypto.createHash('sha256').update(h1).digest();
    }

    async submitBlock(header, coinbaseHex, transactions) {
        const txCount = transactions.length + 1;
        const blockBuf = Buffer.concat([
            header,
            this.varIntBuffer(txCount),
            Buffer.from(coinbaseHex, 'hex'),
            ...transactions.map(t => Buffer.from(t.data, 'hex'))
        ]);

        const blockHex = blockBuf.toString('hex');
        console.log('Submitting block...');
        try {
            const result = await rpc.submitBlock(blockHex);
            console.log('Submit Result:', result);
        } catch (e) {
            console.error('Submit Failed:', e.message);
        }
    }

    varIntBuffer(n) {
        if (n < 0xfd) {
            return Buffer.from([n]);
        } else if (n <= 0xffff) {
            const b = Buffer.alloc(3);
            b[0] = 0xfd;
            b.writeUInt16LE(n, 1);
            return b;
        } else if (n <= 0xffffffff) {
            const b = Buffer.alloc(5);
            b[0] = 0xfe;
            b.writeUInt32LE(n, 1);
            return b;
        }
        return Buffer.alloc(0);
    }
}

module.exports = new ShareManager();
