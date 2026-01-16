import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import { createMint } from '@solana/spl-token';
import fs from 'fs';

// Connect to Devnet
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

const main = async () => {
    console.log("Generating keypair...");
    const payer = Keypair.generate();

    console.log("Requesting Airdrop for fees...");
    const airdropSignature = await connection.requestAirdrop(payer.publicKey, 2 * 1000000000); // 2 SOL
    await connection.confirmTransaction(airdropSignature);
    console.log("Airdrop confirmed.");

    console.log("Creating Mint...");
    const mintAuthority = payer.publicKey;
    const freezeAuthority = payer.publicKey;

    const mint = await createMint(
        connection,
        payer,
        mintAuthority,
        freezeAuthority,
        9 // We assume 9 decimals in the frontend code
    );

    console.log("----------------------------------------");
    console.log("SUCCESS! Created Verification Mint.");
    console.log("Mint Address:", mint.toBase58());
    console.log("----------------------------------------");
    console.log("AUTHORITY SECRET KEY (Import this to Solflare to test):");
    console.log(`[${payer.secretKey.toString()}]`);
    console.log("----------------------------------------");

    // Save to file for easy reading
    const data = {
        mint: mint.toBase58(),
        secretKey: Array.from(payer.secretKey)
    };
    fs.writeFileSync('temp_mint_info.json', JSON.stringify(data, null, 2));
};

main().catch(err => {
    console.error(err);
});
