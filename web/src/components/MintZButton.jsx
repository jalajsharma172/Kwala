import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, Keypair } from '@solana/web3.js';
import {
    createMintToInstruction,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';

// PUBLIC MINT CONFIGURATION
// This Token (zBTC) is configured as a "Public Mint" for this demo.
// The Authority Keypair is embedded here to allow the frontend to sign the mint instruction.
const ZBTC_MINT_ADDRESS = "551wisLRzmkirGnR5YYRucnA5zWMbTVh5T7ipoiMJe4x";
const MINT_AUTH_SECRET = [102, 38, 30, 51, 76, 159, 108, 86, 151, 193, 208, 202, 140, 206, 43, 40, 211, 111, 98, 55, 95, 84, 113, 182, 157, 35, 66, 41, 17, 7, 189, 234, 250, 242, 66, 9, 25, 186, 46, 255, 203, 74, 88, 139, 79, 120, 136, 169, 9, 179, 224, 158, 191, 61, 130, 148, 213, 103, 162, 101, 70, 127, 50, 74];

export const MintZButton = ({ amount = 1 }) => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const [loading, setLoading] = useState(false);

    const onMint = async () => {
        if (!publicKey) {
            alert('Please connect your wallet!');
            return;
        }

        try {
            setLoading(true);
            const mint = new PublicKey(ZBTC_MINT_ADDRESS);

            // Reconstruct the Authority Keypair
            const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(MINT_AUTH_SECRET));

            // 1. Get the Associated Token Account (ATA) for the user
            const associatedToken = await getAssociatedTokenAddress(
                mint,
                publicKey,
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            const transaction = new Transaction();

            // 2. Check if the ATA exists, if not, add instruction to create it
            // User pays for this creation (Rent)
            const accountInfo = await connection.getAccountInfo(associatedToken);
            if (!accountInfo) {
                console.log("Creating ATA for user...");
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        publicKey, // Payer (User)
                        associatedToken,
                        publicKey,
                        mint,
                        TOKEN_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                );
            }

            // 3. Add MintTo instruction
            // We use the Embedded Authority as the signer
            transaction.add(
                createMintToInstruction(
                    mint,
                    associatedToken,
                    mintAuthority.publicKey, // Authority (must match signer)
                    amount * 1000000000,
                    [],
                    TOKEN_PROGRAM_ID
                )
            );

            console.log("Sending transaction...");

            // PARTIAL SIGNING MAGIC:
            // 1. We (Frontend) sign partially with the Mint Authority Keypair.
            // 2. The Wallet Adapter signs with the User's Wallet (Payer).

            // We need to fetch a recent blockhash first to sign manually.
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // Partial Sign by Authority
            transaction.partialSign(mintAuthority);

            // Send via Wallet Adapter (it will ask user to sign & pay)
            const signature = await sendTransaction(transaction, connection);

            console.log("Confirming transaction...");
            await connection.confirmTransaction(signature, 'processed');

            alert(`Successfully minted ${amount} zBTC!\nTx: ${signature}`);

        } catch (error) {
            console.error(error);
            alert(`Minting failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            className="btn-primary"
            onClick={onMint}
            disabled={loading}
            style={{ marginLeft: '1rem', background: 'linear-gradient(45deg, #f7931a, #ffb300)' }}
        >
            {loading ? 'Minting...' : `Mint zBTC`}
        </button>
    );
};
