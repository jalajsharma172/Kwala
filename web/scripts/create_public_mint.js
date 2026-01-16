import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import { createMint } from '@solana/spl-token';
import fs from 'fs';

// Connect to Devnet
const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

const main = async () => {
    console.log("Loading funded payer...");
    // Load existing funded wallet to pay for transaction (from previous step)
    // This avoids needing a new airdrop which is prone to rate limits
    const tempMintData = JSON.parse(fs.readFileSync('temp_mint_info.json'));
    const payer = Keypair.fromSecretKey(Uint8Array.from(tempMintData.secretKey));
    console.log("Payer:", payer.publicKey.toBase58());

    console.log("Generating NEW Public Mint Authority...");
    // We generate a separate keypair for the Authority so we can embed it
    const mintAuthorityKeypair = Keypair.generate();
    const mintAuthority = mintAuthorityKeypair.publicKey;
    const freezeAuthority = mintAuthorityKeypair.publicKey;

    console.log("Creating Public Mint...");
    const mint = await createMint(
        connection,
        payer, // Pays the fee (from temp_mint_info)
        mintAuthority, // The new authority (which we will embed)
        freezeAuthority,
        9
    );

    console.log("----------------------------------------");
    console.log("SUCCESS! Created PUBLIC Mint.");
    console.log("Mint Address:", mint.toBase58());
    console.log("Authority Public Key:", mintAuthorityKeypair.publicKey.toBase58());
    console.log("Authority Secret Key (Embed this in Frontend):");
    console.log(`[${mintAuthorityKeypair.secretKey.toString()}]`);
    console.log("----------------------------------------");

    // Save to file
    const data = {
        mint: mint.toBase58(),
        secretKey: Array.from(mintAuthorityKeypair.secretKey)
    };
    fs.writeFileSync('public_mint_info.json', JSON.stringify(data, null, 2));
};

main().catch(err => {
    console.error(err);
});
