const BigNumber = require('bignumber.js');
const solanaBridge = require('./solana_bridge_sim');

class RewardManager {
    constructor() {
        this.balances = {}; // minerId -> satoshis
        this.currentRoundShares = {}; // minerId -> count
        this.totalShares = 0;
    }

    addShare(minerId) {
        if (!this.currentRoundShares[minerId]) {
            this.currentRoundShares[minerId] = 0;
        }
        this.currentRoundShares[minerId]++;
        this.totalShares++;
    }

    // We need to access miner metadata (solanaAddress). Circular dependency?
    // rewards.js is imported by job_api.js.
    // If we import job_api here, it might be circular.
    // Alternative: Pass the miners list or callback from job_api to handleBlockFound.
    // OR: job_api calls handleBlockFound and passes `minerObject`?
    // Currently job_api calls: shares.validateShare -> rewards.addShare.
    // rewards.handleBlockFound is called by shares.js? (Let's check shares.js)
    // shares.js calls `rewards.handleBlockFound`.
    // Better: rewards.js should remain "Accounting". A higher level controller (job_api?) handles the Payout trigger?
    // OR: Lazy import inside the method?
    // Let's pass the address map to handleBlockFound for now, OR rely on a callback.
    // Simplest for MVP: require job_api inside the method (Lazy load) to avoid top-level circle.

    async handleBlockFound(minerId, blockReward, fees) {
        // Block Reward is usually 50 BTC (Regtest) or subsidy.
        // For MVP, simplistic proportional distribution for the round.

        console.log(`Calculating rewards. Total Shares: ${this.totalShares}`);

        // Lazy load jobApi to avoid circular dependency
        const jobApi = require('./job_api');

        const totalReward = new BigNumber(5000000000); // 50 BTC Regtest default

        for (const [mid, count] of Object.entries(this.currentRoundShares)) {
            const share = new BigNumber(count);
            const userReward = share.dividedBy(this.totalShares).multipliedBy(totalReward);

            if (!this.balances[mid]) {
                this.balances[mid] = new BigNumber(0);
            }
            this.balances[mid] = this.balances[mid].plus(userReward);
            console.log(`Miner ${mid} earned ${userReward.toString()} sats`);

            // Check for Solana Address
            const minerData = jobApi.miners[mid];
            if (minerData && minerData.solanaAddress) {
                // Trigger Instant Payout simulation
                await solanaBridge.mintZBTC(minerData.solanaAddress, userReward.toNumber());
            }
        }

        // Reset Round
        this.currentRoundShares = {};
        this.totalShares = 0;
    }

    getBalance(minerId) {
        return this.balances[minerId] ? this.balances[minerId].toString() : "0";
    }
}

module.exports = new RewardManager();
