const { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js');
const { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');

const NETWORK = 'devnet';
const WALLET_FILE = 'axon-wallet.json';

async function main() {
    console.log(`--- Axon Pool Solana Setup (${NETWORK}) ---`);

    // 1. Connect to Cluster
    const connection = new Connection(clusterApiUrl(NETWORK), 'confirmed');
    console.log('Connected to Solana Devnet');

    // 2. Load or Generate Wallet
    let wallet;
    if (fs.existsSync(WALLET_FILE)) {
        const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_FILE)));
        wallet = Keypair.fromSecretKey(secretKey);
        console.log(`Loaded existing wallet: ${wallet.publicKey.toBase58()}`);
    } else {
        wallet = Keypair.generate();
        fs.writeFileSync(WALLET_FILE, JSON.stringify(Array.from(wallet.secretKey)));
        console.log(`Generated NEW wallet: ${wallet.publicKey.toBase58()}`);
        console.log(`Saved secret key to ${WALLET_FILE} (DO NOT SHARE)`);
    }

    // 3. Airdrop SOL (If needed)
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < 1 * LAMPORTS_PER_SOL) {
        console.log('Requesting Airdrop (2 SOL)...');
        try {
            const signature = await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
            await connection.confirmTransaction(signature);
            console.log('Airdrop successful!');
        } catch (e) {
            console.error('Airdrop failed (Rate limit?):', e.message);
            console.log('Please verify balance or use a faucet manually if next steps fail.');
        }
    }

    // 4. Create Token Mint (zBTC)
    console.log('Creating zBTC Token Mint...');
    // Authority is the pool wallet
    const mint = await createMint(
        connection,
        wallet,
        wallet.publicKey, // Mint Authority
        null, // Freeze Authority
        9, // Decimals (Same as SOL/BTC usually 8 or 9)
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
    );

    console.log(`✅ Token Mint Created: ${mint.toBase58()}`);

    // 5. Create Associated Token Account for the Pool (to hold the supply)
    const poolTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        wallet,
        mint,
        wallet.publicKey
    );
    console.log(`Pool Token Account: ${poolTokenAccount.address.toBase58()}`);

    // 6. Mint Initial Supply (e.g., 1,000,000 zBTC)
    console.log('Minting initial supply...');
    await mintTo(
        connection,
        wallet,
        mint,
        poolTokenAccount.address,
        wallet, // Authority
        1000000 * 1000000000 // 1M * 10^9
    );
    console.log('✅ Minted 1,000,000 zBTC to Pool Wallet');

    // 7. Output Config Info
    console.log('\n--- SETUP COMPLETE ---');
    console.log('Please update your config.json with:');
    const configData = {
        solana: {
            network: 'devnet',
            rpcUrl: 'https://api.devnet.solana.com',
            payerKeypairFile: './axon-wallet.json',
            tokenMint: mint.toBase58()
        }
    };
    console.log(configData);
    fs.writeFileSync('solana_info.json', JSON.stringify(configData, null, 4));
    console.log('Saved to solana_info.json');
}

main().catch(err => {
    console.error(err);
});
