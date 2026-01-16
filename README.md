# Axon-like Mining Pool Walkthrough

## Overview
This project implements a custom Bitcoin Mining Pool from scratch (Node.js) that runs on **Bitcoin Testnet** and supports:
1.  **Stratum V1 Miners** (Real world miners like `cpuminer`).
2.  **Stratum V2 Miners** (Simulated Architecture).
3.  **Instant Solana Payouts** (Simulated "zBTC" Minting when a block is found).

The system runs on **Bitcoin Regtest** (Regression Test Network) for easy development and validation.

## Architecture

```mermaid
graph TD
    A[cpuminer (Stratum V1)] -->|TCP 3333| B(Stratum V1 Server)
    C[Stratum V2 Miner] -->|TCP 3334| D(Stratum V2 Translator)
    
    B --> E[Job API]
    D --> E
    
    E --> F[Job Manager]
    E --> G[Share Validator]
    E --> H[Reward Manager]
    
    F -->|RPC| I[Bitcoin Core Node]
    G -->|Block Submission| I
    
    H --> J[Solana Bridge Sim]
    J -->|Log| K[Mint zBTC]
```

## Setup & Running
> **[📘 READ THE DETAILED MINING GUIDE HERE](docs/MINING_GUIDE.md)**
> Includes Bitcoin Core config, CPUMiner installation, and Solana Payout instructions.

1.  **Start Bitcoin Core (Testnet)**:
    ```bash
    bitcoind -testnet -daemon
    ```

2.  **Start the Pool**:
    ```bash
    cd axon/pool
    npm start
    ```

3.  **Run CPU Miner (Real Testnet Miner)**:
    Since the pool runs on Windows and you are in WSL, use your Windows IP (e.g., `172.17.176.1` or `192.168.x.x`):
    ```bash
    ./cpuminer -a sha256d -o stratum+tcp://172.17.176.1:3333 -u miner1 -p x
    ```
    *Note: Replace `172.17.176.1` with your actual Windows IP if different.*

4.  **Simulated Miners (Optional Verification)**:
    *   **V1 Miner**: `node test_miner.js`
    *   **V2 Miner**: `node test/sv2_test_client.js`

5.  **Stop Bitcoin Core (Testnet)**:
    ```bash
    bitcoin-cli -testnet stop
    ```

## Verification of Payouts

When the **V2 Miner** finds a "block" (forced via magic nonce `deadbeef` on regtest):

1.  The Pool validates the share in `shares.js`.
2.  It calls `rewards.js`.
3.  It fetches the miner's Solana Address (`SolanaMinerWallet123`).
4.  It calls `solana_bridge_sim.js`.
5.  You see this in the logs:

```text
[Solana Bridge] 🏛️  MINT INSTRUCTION INITIATED
[Solana Bridge] 📥  Recipient: SolanaMinerWallet123
[Solana Bridge] 💰  Amount:    5000000000 sats (50 zBTC)
[Solana Bridge] ✅  MINT SUCCESS: Signature ...
```

## Project Structure

```text
axon/
└── pool/
    ├── src/
    │   ├── job_api.js               # Central mining logic (brain)
    │   ├── jobs.js                  # Block template handling
    │   ├── rewards.js               # Reward calculation
    │   ├── rpc.js                   # Bitcoin RPC wrapper
    │   ├── server.js                # Entry point
    │   ├── shares.js                # Share validation
    │   ├── solana_bridge_sim.js     # Simulated Solana payout
    │   ├── stratum.js               # Stratum V1 server
    │   └── stratum_v2_translator.js # Stratum V2 (simulated JSON-over-TCP)
    ├── test/
    │   └── sv2_test_client.js       # Simulated V2 miner
    ├── config.json
    ├── package.json
    ├── README.md
    └── test_miner.js                # Simulated V1 miner
```


## Key Files
- `src/job_api.js`: The brain. Decouples protocol from logic.
- `src/stratum_v2_translator.js`: The bridge for V2 miners.
- `src/solana_bridge_sim.js`: The payout module.

## Useful Links (Testnet3)

You can track your pool's on-chain activity using any of these explorers:

*   **Mempool.space (Testnet)**: [https://mempool.space/testnet/](https://mempool.space/testnet/)
*   **Blockstream Explorer**: [https://blockstream.info/testnet/](https://blockstream.info/testnet/)
*   **Bitaps Testnet**: [https://tbtc.bitaps.com/](https://tbtc.bitaps.com/)
*   **BlockCypher**: [https://live.blockcypher.com/btc-testnet/](https://live.blockcypher.com/btc-testnet/)
