const jobs = require('./jobs');
const shares = require('./shares');
const crypto = require('crypto');

class JobAPI {
    constructor() {
        this.miners = {}; // minerId -> { extraNonce1, ... }
    }

    /**
     * Registers a new miner session.
     * @param {Object} metadata - Transport specific metadata (ip, agent, etc.)
     * @returns {Object} { minerId, extraNonce1, extraNonce2Size }
     */
    registerMiner(metadata = {}) {
        const minerId = crypto.randomUUID();
        // For MVP, we use the global extraNonce1 if simplified, or generate unique.
        // Stratum V1 implementation in Phase 1 used a shared EN1 or unique?
        // Phase 1 jobs.js had `this.extraNonce1 = config...`.
        // Phase 1 stratum.js generated `miner.extraNonce1 = jobs.extraNonce1`.
        // To support V2/multiple miners properly, we should ideally produce unique EN1s or Ensure EN2 space is enough.
        // Let's stick to Phase 1 behavior: Use Shared EN1 for now (Simplest) or Generate.
        // If we duplicate EN1, we rely on EN2 uniqueness? No, distinct miners need distinct (EN1, EN2) space usually.
        // Let's generate unique EN1 per miner for better correctness in Phase 2.

        const extraNonce1 = crypto.randomBytes(4).toString('hex');

        this.miners[minerId] = {
            id: minerId,
            extraNonce1: extraNonce1,
            extraNonce2Size: 4, // Fixed for now
            metadata: metadata,
            solanaAddress: metadata.solanaAddress || null, // Store Solana Address
            authorized: false,
            username: null
        };

        return {
            minerId: minerId,
            extraNonce1: extraNonce1,
            extraNonce2Size: 4
        };
    }

    /**
     * Authorizes a miner.
     * @param {String} minerId 
     * @param {String} username 
     * @param {String} password 
     * @returns {Boolean} success
     */
    authorizeMiner(minerId, username, password) {
        const miner = this.miners[minerId];
        if (!miner) return false;

        miner.authorized = true;
        miner.username = username;
        return true;
    }

    /**
     * Gets the current job for a miner.
     * @param {String} minerId 
     * @returns {Object|null} job object or null
     */
    getJobForMiner(minerId) {
        if (!this.miners[minerId]) return null;
        // In Phase 1, `jobs.currentJob` is the broadcast job.
        return jobs.currentJob;
    }

    /**
     * Submits a share/block from a transport layer.
     * @param {String} minerId 
     * @param {Object} submission - { jobId, extraNonce2, nTime, nonce }
     * @returns {Object} result - { valid: boolean, error: String|null, blockFound: boolean }
     */
    submitShareFromTransport(minerId, submission) {
        const miner = this.miners[minerId];
        if (!miner) return { valid: false, error: "Miner not found" };
        if (!miner.authorized) return { valid: false, error: "Unauthorized" };

        const { jobId, extraNonce2, nTime, nonce } = submission;

        // Construct a "miner" object compatible with Phase 1 logic if needed, 
        // OR pass explicit params to shares.js
        // Phase 1 shares.validateShare(miner, jobId, extraNonce2, nTime, nonce)
        // It uses `miner.extraNonce1` and `miner.id` (or wallet).

        // We can pass our `miner` object which has `extraNonce1` and `id`.
        // Phase 1 `shares.js` also calls `rewards.handleBlockFound(miner.wallet || miner.id...)`
        // Our `miner` has `id`. We can add `wallet: miner.username`.

        const legacyMinerObj = {
            id: miner.id,
            extraNonce1: miner.extraNonce1,
            wallet: miner.username
        };

        try {
            const result = shares.validateShare(legacyMinerObj, jobId, extraNonce2, nTime, nonce);
            return result; // { valid: true/false }
        } catch (e) {
            console.error("JobAPI Submit Error:", e);
            return { valid: false, error: e.message };
        }
    }

    /**
     * Cleans up miner state on disconnect.
     * @param {String} minerId 
     */
    removeMiner(minerId) {
        if (this.miners[minerId]) {
            delete this.miners[minerId];
            return true;
        }
        return false;
    }
}

module.exports = new JobAPI();
