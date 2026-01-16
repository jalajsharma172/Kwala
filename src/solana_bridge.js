const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount, transfer, getMint } = require('@solana/spl-token');
const fs = require('fs');
const config = require('../config.json');

class SolanaBridge {
    constructor() {
        this.connection = null;
        this.wallet = null;
        this.mintAddress = null;
        this.decimals = 9; // Default, will verify on init
        this.enabled = false;
    }

    async init() {
        if (!config.solana) {
            console.log('[Solana Bridge] No configuration found. Skipping.');
            return;
        }

        try {
            console.log(`[Solana Bridge] Connecting to ${config.solana.network}...`);
            console.log(`[Solana Bridge] CWD: ${process.cwd()}`);

            this.connection = new Connection(config.solana.rpcUrl, 'confirmed');

            // --- DEV OVERRIDE: Load Temp Mint & Authority ---
            // For zBTC feature, we use the temp_mint_info.json if it exists
            const tempMintPath = 'web/temp_mint_info.json';
            if (fs.existsSync(tempMintPath)) {
                console.log(`[Solana Bridge] 🧪 Loading DEV Mint Info from ${tempMintPath}`);
                const mintData = JSON.parse(fs.readFileSync(tempMintPath));
                this.mintAddress = new PublicKey(mintData.mint);
                this.wallet = Keypair.fromSecretKey(Uint8Array.from(mintData.secretKey));
                this.decimals = 9; // Hardcoded for this dev flow
                console.log(`[Solana Bridge] Loaded Dev Authority: ${this.wallet.publicKey.toBase58()}`);
                console.log(`[Solana Bridge] Loaded Dev Mint: ${this.mintAddress.toBase58()}`);
            } else {
                // Fallback to normal config
                const walletPath = config.solana.payerKeypairFile;
                console.log(`[Solana Bridge] Checking wallet at: ${walletPath}`);
                if (fs.existsSync(walletPath)) {
                    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(config.solana.payerKeypairFile)));
                    this.wallet = Keypair.fromSecretKey(secretKey);
                    console.log(`[Solana Bridge] Loaded Payer: ${this.wallet.publicKey.toBase58()}`);
                } else {
                    // Just warn for now, don't crash if dev mode
                    console.warn(`[Solana Bridge] Wallet file not found: ${config.solana.payerKeypairFile}`);
                }

                if (config.solana.tokenMint) {
                    this.mintAddress = new PublicKey(config.solana.tokenMint);
                    try {
                        const mintInfo = await getMint(this.connection, this.mintAddress);
                        this.decimals = mintInfo.decimals;
                    } catch (e) { console.warn("Could not fetch mint info", e.message); }
                }
            }

            if (this.wallet && this.mintAddress) {
                this.enabled = true;
                console.log('[Solana Bridge] ✅ Ready for Payouts & Minting');
            } else {
                console.log('[Solana Bridge] ⚠️ Bridge initialized but missing Wallet or Mint. Disabled.');
            }

        } catch (e) {
            console.error('[Solana Bridge] Initialization Failed:', e.message);
            this.enabled = false;
        }
    }

    async mintZBTC(recipientAddress, amount) {
        if (!this.enabled) {
            throw new Error('Solana Bridge not enabled');
        }

        console.log(`[Solana Bridge] 🏭 Minting ${amount} zBTC to ${recipientAddress}`);

        try {
            const recipientPubkey = new PublicKey(recipientAddress);
            const rawAmount = BigInt(amount * Math.pow(10, this.decimals));

            // 1. Get/Create Destination ATA
            const destATA = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.wallet, // Payer
                this.mintAddress,
                recipientPubkey
            );

            // 2. Mint To
            const { mintTo } = require('@solana/spl-token');
            const signature = await mintTo(
                this.connection,
                this.wallet, // Payer
                this.mintAddress,
                destATA.address, // Destination
                this.wallet, // Authority
                rawAmount
            );

            console.log(`[Solana Bridge] ✅ Mint Success: ${signature}`);
            return signature;

        } catch (e) {
            console.error('[Solana Bridge] Mint Failed:', e);
            throw e;
        }
    }

    async payoutSPL(recipientAddress, amountSats) {
        if (!this.enabled) {
            console.log('[Solana Bridge] ⚠️  Bridge not enabled. Skipping payout.');
            return;
        }

        console.log(`[Solana Bridge] 🚀 Initiating Payout: ${amountSats} sats to ${recipientAddress}`);

        try {
            const recipientPubkey = new PublicKey(recipientAddress);

            // Conversion: 1 BTC (10^8 sats) = 1 zBTC (10^9 atoms)
            // 1 sat = 10 atoms
            // If decimals differ, adjust accordingly.
            // BTC Decimals = 8. Token Decimals = this.decimals.
            // Multiplier = 10 ^ (TokenDecimals - 8)
            // If TokenDecimals = 9, Multiplier = 10.
            const multiplier = Math.pow(10, this.decimals - 8);
            const amountAtoms = BigInt(amountSats) * BigInt(multiplier);

            console.log(`[Solana Bridge] 🔄 Converting: ${amountSats} sats -> ${amountAtoms} atoms`);

            // 1. Get Source ATA (Pool)
            const sourceATA = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.wallet,
                this.mintAddress,
                this.wallet.publicKey
            );

            // 2. Get Destination ATA (Recipient)
            // We pay for creation if it doesn't exist
            console.log(`[Solana Bridge] 🔍 Resolving Recipient Token Account...`);
            const destATA = await getOrCreateAssociatedTokenAccount(
                this.connection,
                this.wallet, // Payer of fees
                this.mintAddress,
                recipientPubkey
            );

            // 3. Transfer
            console.log(`[Solana Bridge] 💸 Sending Transaction...`);
            const signature = await transfer(
                this.connection,
                this.wallet, // Payer
                sourceATA.address, // From
                destATA.address, // To
                this.wallet.publicKey, // Authority
                amountAtoms
            );

            console.log(`[Solana Bridge] ✅ PAYOUT SUCCESS!`);
            console.log(`[Solana Bridge] 🔗 Signature: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

            return signature;

        } catch (e) {
            console.error('[Solana Bridge] ❌ Payout Failed:', e.message);
            // Don't crash the pool, just log error.
        }
    }
}
module.exports = new SolanaBridge();
