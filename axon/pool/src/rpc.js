const axios = require('axios');
const config = require('../config.json');

class BitcoinRPC {
    constructor() {
        this.client = axios.create({
            baseURL: `http://${config.rpc.host}:${config.rpc.port}`,
            auth: {
                username: config.rpc.user,
                password: config.rpc.password
            },
            timeout: 5000
        });
    }

    async call(method, params = []) {
        try {
            const response = await this.client.post('/', {
                jsonrpc: '1.0',
                id: 'curltest', // Standard ID
                method: method,
                params: params
            });

            if (response.data.error) {
                throw new Error(`RPC Error (${method}): ${JSON.stringify(response.data.error)}`);
            }

            return response.data.result;
        } catch (error) {
            if (error.response) {
                throw new Error(`RPC HTTP Error (${method}): ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else if (error.request) {
                throw new Error(`RPC Request Error (${method}): No response received. Is Bitcoin Core running?`);
            } else {
                throw new Error(`RPC Setup Error (${method}): ${error.message}`);
            }
        }
    }

    async getBlockTemplate(rules = []) {
        // Bitcoin Core expects: {"rules": ["segwit"]}
        // But `params` must be an ARRAY of arguments.
        // So argument 0 is the object.
        return this.call('getblocktemplate', [{ rules: rules }]);
    }

    async submitBlock(hex) {
        return this.call('submitblock', [hex]);
    }

    async getBlockchainInfo() {
        return this.call('getblockchaininfo');
    }

    async validateAddress(address) {
        return this.call('validateaddress', [address]);
    }
}

module.exports = new BitcoinRPC();
