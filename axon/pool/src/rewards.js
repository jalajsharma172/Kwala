const BigNumber = require('bignumber.js');

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

    handleBlockFound(minerId, blockReward, fees) {
        // Block Reward is usually 50 BTC (Regtest) or subsidy.
        // For MVP, simplistic proportional distribution for the round.

        // reward = (shares / total) * (subsidy + fees)
        // Ignoring fees for MVP simplicity or assume included in total.

        console.log(`Calculating rewards. Total Shares: ${this.totalShares}`);

        // Convert blockReward to Satoshis? blockReward input is usually BTC?
        // Or in jobs.js we saw `coinbasevalue` (satoshis).
        // Let's assume input is Satoshis.
        const totalReward = new BigNumber(5000000000); // 50 BTC Regtest default

        for (const [mid, count] of Object.entries(this.currentRoundShares)) {
            const share = new BigNumber(count);
            const userReward = share.dividedBy(this.totalShares).multipliedBy(totalReward);

            if (!this.balances[mid]) {
                this.balances[mid] = new BigNumber(0);
            }
            this.balances[mid] = this.balances[mid].plus(userReward);
            console.log(`Miner ${mid} earned ${userReward.toString()} sats`);
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
