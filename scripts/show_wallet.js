const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

const WALLET_FILE = 'axon-wallet.json';

if (fs.existsSync(WALLET_FILE)) {
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_FILE)));
    const wallet = Keypair.fromSecretKey(secretKey);
    console.log(wallet.publicKey.toBase58());
    fs.writeFileSync('wallet_address.txt', wallet.publicKey.toBase58());
} else {
    console.error('Wallet file not found.');
}
