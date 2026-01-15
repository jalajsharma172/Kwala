const crypto = require('crypto');
const BigNumber = require('bignumber.js');
const jobs = require('./jobs');
const rpc = require('./rpc');
const rewards = require('./rewards'); // We will create this next
const config = require('../config.json');

class ShareManager {
    constructor() {
        // Pool Difficulty (Static for now)
        // Difficulty 1 Target (approx): 0x00000000FFFF0000000000000000000000000000000000000000000000000000
        // Regtest allows easier targets.
        // We use a BigNumber for the target.
        // Hardcoded diff 1 for simplicity or read from config.
        this.poolTarget = new BigNumber('00000000FFFF0000000000000000000000000000000000000000000000000000', 16);
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
            // Stratum V1: Hash(Root + Step). 
            // Since Coinbase is index 0.
            merkleRoot = this.doubleSha256(Buffer.concat([merkleRoot, branchStep]));
        }

        // 3. Construct Block Header
        // Version (4 LE) | PrevHash (32 LE) | Root (32 LE) | Time (4 LE) | Bits (4 LE) | Nonce (4 LE)

        const versionBuf = Buffer.alloc(4);
        versionBuf.writeUInt32LE(job.version);

        // PrevHash: stored as RPC Hex (Big Endian usually). Convert to LE.
        const prevHashBuf = Buffer.from(job.previousHash, 'hex').reverse();

        // Root: Already LE? 
        // Our calculation `doubleSha256` produces internal byte order (LE).
        // So `merkleRoot` is LE.

        const timeBuf = Buffer.alloc(4);
        // nTime is hex string (BE) from Stratum Submit? 
        // Req params: nTime (hex).
        // We need to write it LE.
        timeBuf.writeUInt32LE(parseInt(nTime, 16));

        // Bits: hex string (BE) in Job. 
        const bitsBuf = Buffer.from(job.nBits, 'hex').reverse();
        // Wait, nBits "1d00ffff" -> 0xffff001d LE.
        // Is `job.nBits` stored as hex? Yes `tmpl.bits` (RPC) usually hex string (BE).
        // Verify: RPC `bits`: "1d00ffff". 
        // If we Reverse, we get "ffff001d". Correct.

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
        if (hashNum.gt(this.poolTarget)) {
            // Hash MUST be less than target.
            // console.log(`Share rejected. Hash: ${blockHashHex} > PoolTarget`);

            // Wait, for MVP debug on Regtest, difficulty is min.
            // Regtest target is huge.
            // User requested "Accurate per-miner share tracking".
            // If checking against job.target (Network Target).
        }

        // Check validity against Pool Target
        const isShareValid = hashNum.lte(this.poolTarget);
        if (!isShareValid) {
            console.log(`Share invalid: ${blockHashHex}`);
            return { valid: false };
        }

        // Log Share
        rewards.addShare(miner.id);

        // 6. Check Network Target (Block Found!)
        const networkTarget = new BigNumber(job.target, 16);
        const isBlock = hashNum.lte(networkTarget);

        if (isBlock) {
            console.log(`BLOCK FOUND! Hash: ${blockHashHex}`);
            this.submitBlock(header, coinbaseHex, job.transactions);
            rewards.handleBlockFound(miner.wallet || miner.id, 50, 0); // Simplified reward
        }


        // Return valid
        return { valid: true };
    }

    doubleSha256(buf) {
        const h1 = crypto.createHash('sha256').update(buf).digest();
        return crypto.createHash('sha256').update(h1).digest();
    }

    async submitBlock(header, coinbaseHex, transactions) {
        // Construct full block info
        // Header (80)
        // TxCount (VarInt)
        // Coinbase
        // Txs

        const txCount = transactions.length + 1;

        const blockBuf = Buffer.concat([
            header,
            this.varIntBuffer(txCount),
            Buffer.from(coinbaseHex, 'hex'),
            ...transactions.map(t => Buffer.from(t.data, 'hex')) // 'data' is hex in getblocktemplate?
            // Checking getblocktemplate: "data" key contains full tx hex. Yes.
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
