const rpc = require('./rpc');
const config = require('../config.json');
const crypto = require('crypto');
const BigNumber = require('bignumber.js');

// Constants
const COINBASE_TX_INPUT_TXID = '0000000000000000000000000000000000000000000000000000000000000000';
const COINBASE_TX_INPUT_INDEX = 'ffffffff';
const COINBASE_TX_SEQUENCE = 'ffffffff'; // Or 00000000
const DEFAULT_VERSION = 536870912; // 0x20000000

class JobManager {
    constructor() {
        this.currentJob = null;
        this.jobs = {};
        this.extraNonce1 = config.pool.stratumHostExtranonce1 || crypto.randomBytes(4).toString('hex');
        this.extraNonce2Size = 4;
    }

    async init() {
        // Validate pool address and get scriptPubKey
        console.log(`Validating pool address: ${config.pool.address}`);
        const addrInfo = await rpc.validateAddress(config.pool.address);
        if (!addrInfo.isvalid) {
            throw new Error(`Invalid pool address: ${config.pool.address}`);
        }
        this.poolScriptPubKey = addrInfo.scriptPubKey;
        console.log(`Pool ScriptPubKey: ${this.poolScriptPubKey}`);
    }

    async updateBlockTemplate() {
        try {
            const template = await rpc.getBlockTemplate(['segwit']);
            const job = this.createJob(template);

            // If new job, update current
            if (!this.currentJob || job.previousHash !== this.currentJob.previousHash || job.height !== this.currentJob.height) {
                this.currentJob = job;
                this.jobs[job.jobId] = job;
                console.log(`New Job Created: ${job.jobId} | Height: ${job.height} | Prev: ${job.previousHash.substring(0, 16)}...`);
                return job;
            }
        } catch (e) {
            console.error('Error updating block template:', e.message);
        }
        return null;
    }

    createJob(tmpl) {
        const jobId = crypto.randomBytes(4).toString('hex');

        // 1. Calculate Block Reward (Subsidy + Fees)
        let reward = tmpl.coinbasevalue; // Satoshi
        // Note: coinbasevalue is sometimes missing, handle via subsidy + fees usually? 
        // Bitcoin Core getblocktemplate usually provides 'coinbasevalue'.

        // 2. Build Coinbase Transaction
        // We will build `coinbase1` and `coinbase2` for Stratum V1.
        // Structure: [Version][InCount][InHash][InIndex][ScriptLen][Height][EN1][EN2][...][Seq][OutCount][Outs][Locktime]

        const bip34HeightHex = this.encodeHeight(tmpl.height);
        // Script: [HeightLen][HeightBytes] + [Extranonce1] + [Extranonce2 placeholder] + [Aux]
        // Stratum V1: miner injects EN2.
        // We put EN1.

        // Coinbase Input Script part 1: BIP34 Height
        // Pushing height: https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki
        // Script: <len> <height_bytes>

        // Simple buffer construction
        const scriptHeight = Buffer.concat([
            Buffer.from([bip34HeightHex.length / 2]),
            Buffer.from(bip34HeightHex, 'hex')
        ]);

        const en1Buf = Buffer.from(this.extraNonce1, 'hex');
        // EN2 size is 4 bytes usually.

        // coinbase1: 
        // Version (4) + InCount (1) + PrevHash (32) + Index (4) + ScriptLength (varint) + Script(Height + EN1)
        // Wait, Stratum V1 standard: "coinbase1" ends, then EN1, then EN2, then "coinbase2"?
        // Typically: coinbase1 = Version...ScriptLen + Height. 
        // Then miner adds EN1 + EN2 + Rest?
        // NO. Stratum mining.notify params: jobId, prevHash, coinbase1, coinbase2, ...
        // Miner does: hash(coinbase1 + extranonce1 + extranonce2 + coinbase2)
        // So `coinbase1` must technically include ScriptLen? 
        // If script is `Push(Height) + Push(EN1+EN2)`, then `coinbase1` is Version..Index + ScriptLen + Push(Height).
        // Then we send `extranonce1` in subscribe.
        // Where does `Push(EN1+EN2)` come from? 
        // Usually the script is just generic bytes.
        // Let's assume script is: BIP34_Height || EN1 || EN2.
        // So `coinbase1` = Ver...Index + VarInt(TotalScriptLen) + BIP34_Height.
        // But TotalScriptLen depends on EN2 size!
        // We know EN2 size (4). EN1 size (4). Height size (varies).
        // Total Len = HeightScriptLen + EN1Len + EN2Len.

        const totalScriptLen = scriptHeight.length + en1Buf.length + this.extraNonce2Size;

        const coinbase1Req = Buffer.concat([
            Buffer.from('01000000', 'hex'), // Version 1 (or 2)
            Buffer.from('01', 'hex'), // Input Count
            Buffer.from(COINBASE_TX_INPUT_TXID, 'hex'),
            Buffer.from(COINBASE_TX_INPUT_INDEX, 'hex'),
            this.varIntBuffer(totalScriptLen),
            scriptHeight
        ]);

        // coinbase2: Sequence + OutputCount + Outputs + LockTime.
        // We need Witness Commitment Output if Segwit is active.
        let outputs = [];

        // Output 1: Reward
        // ScriptPubKey from validateaddress
        outputs.push({
            value: reward,
            script: Buffer.from(this.poolScriptPubKey, 'hex')
        });

        // Output 2: Witness Commitment?
        if (tmpl.default_witness_commitment) {
            // We use the default one for now, assuming 0-nonce coinbase calculation matches?
            // Actually `default_witness_commitment` assumes the coinbase is created a specific way?
            // "The witness commitment ... requires ... 0x00...00 wtxid for coinbase".
            // If we just include the `default_witness_commitment` provided by Core, it is calculated based on the OTHER transactions.
            // And since Coinbase wtxid is FORCED to 0 in the calculation, our changes to Coinbase Input don't affect the root!
            // So we can just use `default_witness_commitment` as is!
            // Correct.
            outputs.push({
                value: 0,
                script: Buffer.from(tmpl.default_witness_commitment, 'hex')
            });
        }

        const coinbase2Req = Buffer.concat([
            Buffer.from(COINBASE_TX_SEQUENCE, 'hex'),
            this.encodeOutputs(outputs),
            Buffer.from(this.encodeUInt32(tmpl.curtime), 'hex'), // Locktime or nTime used? 
            // Locktime is at end of tx. Block header has nTime.
            // Tx Locktime usually 0.
            Buffer.from('00000000', 'hex')
        ]);

        // Merkle Logic
        // We have transaction hashes (txids). We need to build the tree.
        // Coinbase is the first leaf.
        // Stratum needs `merkle_branch`: path from coinbase to root.
        const txHashes = tmpl.transactions.map(t => t.hash); // These are little-endian TXIDs usually?
        // Bitcoin Core returns TXIDs in Big Endian Hex usually (RPC).
        // Merkle tree calculation uses internal byte order (Little Endian).
        // So we might need to reverse them?
        // Let's verify `getblocktemplate` output format. Usually Hex strings (Big Endian).
        // Internal hashing uses Little Endian.

        const merkleBranch = this.buildMerkleBranch(txHashes);

        return {
            jobId: jobId,
            previousHash: tmpl.previousblockhash,
            coinbase1: coinbase1Req.toString('hex'),
            coinbase2: coinbase2Req.toString('hex'),
            merkleBranch: merkleBranch,
            version: tmpl.version,
            nBits: tmpl.bits,
            nTime: tmpl.curtime,
            cleanJobs: true,
            transactions: tmpl.transactions,
            target: tmpl.target
        };
    }

    // Helpers
    encodeHeight(height) {
        // BIP34: height as little-endian encoded number
        const buffer = Buffer.alloc(4);
        buffer.writeInt32LE(height);
        // Trim trailing zeros? BIP34 says "serialized as a script CScriptNum". 
        // CScriptNum: minimal verification.
        let len = 4;
        while (len > 0 && buffer[len - 1] === 0) {
            len--;
        }
        // If the MSB of the last byte is set, we need to add a 00 byte to make it positive?
        // (CScriptNum is signed).
        if (len > 0 && (buffer[len - 1] & 0x80)) {
            // Need to pad
            // But for simple positive heights, standard logic:
            // e.g. height=1. Hex=01.
            // height=256. Hex=0001 (LE). 
        }
        return buffer.slice(0, len).toString('hex');
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
        // BigInt support needed for larger? 
        return Buffer.alloc(0);
    }

    encodeUInt32(n) {
        const b = Buffer.alloc(4);
        b.writeUInt32LE(n);
        return b.toString('hex');
    }

    encodeOutputs(outputs) {
        // VarInt count
        const count = this.varIntBuffer(outputs.length);
        const bufs = [count];
        for (const out of outputs) {
            // Value (8 bytes LE)
            const val = Buffer.alloc(8);
            // Javascript numbers lose precision > 53 bits.
            // But coinbase rewards (50 BTC) are < 2^53. 
            // Max satoshis 21e14 < 9e15. Safe.
            const bigVal = BigInt(out.value);
            val.writeBigUInt64LE(bigVal);

            // ScriptLen (VarInt)
            const scriptLen = this.varIntBuffer(out.script.length);

            bufs.push(val);
            bufs.push(scriptLen);
            bufs.push(out.script);
        }
        return Buffer.concat(bufs);
    }

    buildMerkleBranch(txIds) {
        // Stratum V1 merkle branch is list of partners.
        // The miner has the coinbase hash (leaf 0).
        // It needs leaf 1, then the partner of (0+1), etc.
        const branch = [];
        let tree = txIds.map(h => Buffer.from(h, 'hex').reverse()); // Convert BE Hex to LE Buffer

        // We only need the path for the Coinbase (Index 0).
        // So we need: tree[1], then hash(tree[2]+tree[3]), etc.

        // Wait, Stratum branch format: array of 32-byte hashes.
        // The miner does: H = Hash(Coinbase).
        // For step in branch: H = Hash(H + step) (if H is left) or Hash(step + H).
        // Since Coinbase is always index 0 (Leftmost), we always concat (H + step).

        // We need to calculate the tree layer by layer, but only keep the nodes needed for index 0 path.
        // Level 0: [Coinbase(Missing), T1, T2, T3...]
        // Branch needs: T1.
        // Next Level: [H(C+T1), H(T2+T3)...]
        // Branch needs: H(T2+T3).

        // But we don't have Coinbase yet!
        // The miner will provide it.
        // So we assume Coinbase is there. We just need the "Right Sibling" at each level.

        let currentLevel = tree; // These are ALL OTHER transactions. 
        // Coinbase is implicitly at index 0 of the FULL array.
        // So 'tree' currently contains indices 1..N of the block.
        // Wait, getblocktemplate gives `transactions` which are the NON-coinbase txs.

        // So Level 0 (Leaves) = [Placeholder, T1, T2, T3, T4].
        // Path Element 1: T1.
        // Calculate Parent of (T1, T2)? No. (Placeholder, T1) -> P0. (T2, T3) -> P1.
        // Path Element 2: P1.

        while (currentLevel.length > 0) {
            // If checking from perspective of Coinbase (Index 0)...
            // We need the node at Index 1.
            if (currentLevel.length > 0) {
                branch.push(currentLevel[0].toString('hex')); // Helper: send as HEX (usually BE for Stratum?)
                // Standard Stratum: Little Endian hex? Or Big Endian?
                // Usually just bytes. "mining.notify" sends hex strings. 
                // Usually Stratum uses Big Endian for the strings? 
                // "The resulting merkle root is little endian".
                // Let's assume LE Hex as that's what we used for 'tree'.
            } else {
                // No partner? (e.g. only coinbase).
            }

            // Propagate up.
            const nextLevel = [];
            // We need to hash pairs.
            // But we are missing the first element (Coinbase path).
            // Actually, we can compute the REST of the tree.
            // (T1, T2) -> Hash(T1, T2)? No, Coinbase is T0.
            // So: H(T0, T1). H(T2, T3). H(T4, T5).
            // T1 is the partner of T0. We added T1 to branch.
            // Now we need to form the next level hashes so we can find the partner for the NEXT layer.
            // We need H(T2, T3), H(T4, T5)...
            // T1 is consumed by T0.

            // So we loop start from 1?
            // Input: [T1, T2, T3, T4]
            // Branch: T1.
            // Next Level needs: [  H(T2, T3), H(T4, T5)  ]

            for (let i = 1; i < currentLevel.length; i += 2) {
                const left = currentLevel[i];
                const right = (i + 1 < currentLevel.length) ? currentLevel[i + 1] : left; // Duplicate if odd
                nextLevel.push(this.doubleSha256(Buffer.concat([left, right])));
            }
            currentLevel = nextLevel;
        }

        return branch;
    }

    doubleSha256(buf) {
        const h1 = crypto.createHash('sha256').update(buf).digest();
        return crypto.createHash('sha256').update(h1).digest();
    }
}

module.exports = new JobManager();
