const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, '..', 'axon.db');
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Could not connect to database', err);
                    reject(err);
                } else {
                    console.log('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                minerId TEXT,
                jobId TEXT,
                difficulty REAL,
                timestamp INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS rewards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                minerId TEXT,
                amount REAL,
                txHash TEXT,
                timestamp INTEGER
            )`,
            `CREATE TABLE IF NOT EXISTS miners (
                id TEXT PRIMARY KEY,
                address TEXT,
                workerName TEXT,
                ip TEXT,
                lastSeen INTEGER
            )`
        ];

        for (const query of queries) {
            await this.run(query);
        }
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Helper methods
    async addShare(minerId, jobId, difficulty) {
        return this.run(
            'INSERT INTO shares (minerId, jobId, difficulty, timestamp) VALUES (?, ?, ?, ?)',
            [minerId, jobId, difficulty, Date.now()]
        );
    }

    async addReward(minerId, amount, txHash = null) {
        return this.run(
            'INSERT INTO rewards (minerId, amount, txHash, timestamp) VALUES (?, ?, ?, ?)',
            [minerId, amount, txHash, Date.now()]
        );
    }

    async updateMiner(id, address, workerName, ip) {
        return this.run(
            `INSERT INTO miners (id, address, workerName, ip, lastSeen) 
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET 
             address=excluded.address, 
             workerName=excluded.workerName, 
             ip=excluded.ip, 
             lastSeen=excluded.lastSeen`,
            [id, address, workerName, ip, Date.now()]
        );
    }

    async getMinerRewards(minerId) {
        const result = await this.get('SELECT SUM(amount) as total FROM rewards WHERE minerId = ?', [minerId]);
        return result ? result.total : 0;
    }

    async getMinerStats(minerId) {
        // 1. Total Shares
        const totalSharesResult = await this.get('SELECT COUNT(*) as count FROM shares WHERE minerId = ?', [minerId]);
        const totalShares = totalSharesResult ? totalSharesResult.count : 0;

        // 2. Shares Histogram (Shares per minute for last 60 mins)
        // Group by minute: timestamp / 60000
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        const rows = await this.all(
            `SELECT (timestamp / 60000) as minute, COUNT(*) as count 
             FROM shares 
             WHERE minerId = ? AND timestamp > ? 
             GROUP BY minute 
             ORDER BY minute ASC`,
            [minerId, oneHourAgo]
        );

        // Fill in gaps? For simplicity, we return the raw rows. Frontend can fill gaps.
        // Or we can construct the array here. Let's return the raw data points.
        const graphData = rows.map(r => ({
            time: r.minute * 60000,
            count: r.count
        }));

        return {
            minerId,
            totalShares,
            graphData
        };
    }
}

module.exports = new Database();
