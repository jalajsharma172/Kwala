# Axon Pool Codebase Documentation

This document provides a detailed explanation of the files in the Axon Pool project, covering both the backend (Node.js/Express) and the frontend (React/Vite).

## Backend (`src/`)

The backend is responsible for handling stratum connections from miners, communicating with the Bitcoin Core RPC, managing the database, and serving the API for the frontend.

### Core Server & Database

#### `server.js`
**Purpose**: The main entry point for the backend application.
**Key Functions**:
- `main()`: Initializes the application components (Solana Bridge, Database, Job Manager, Stratum Servers) and starts the Express API server.
- **API Routes**:
  - `POST /api/mint`: Mints zBTC to a specified address.
  - `GET /api/stats`: Returns pool statistics (miners, hashrate, block height, etc.).
  - `GET /api/miner/:id`: Returns detailed statistics for a specific miner.

#### `database.js`
**Purpose**: Manages the SQLite database (`axon.db`) for persisting shares, rewards, and miner information.
**Key Functions**:
- `init()`: Connects to the SQLite database and initializes tables.
- `createTables()`: Creates `shares`, `rewards`, and `miners` tables if they don't exist.
- `addShare(minerId, jobId, difficulty)`: Records a valid share submission.
- `addReward(minerId, amount)`: Records a reward payout.
- `updateMiner(id, address, workerName, ip)`: Updates miner metadata (Last seen, IP, etc.).
- `getMinerStats(minerId)`: Retreives total shares and historical graph data for a miner.

### Mining Logic & Stratum

#### `job_api.js`
**Purpose**: Manages miner sessions and authentication. Acts as a middleman between Stratum servers and the core logic.
**Key Functions**:
- `registerMiner(metadata)`: Creates a new miner session and generates an `extraNonce1`.
- `authorizeMiner(minerId, username, password)`: Authorizes a miner and parses the password for optional config (like Solana address).
- `submitShareFromTransport(minerId, submission)`: Validates a share submitted by a miner.

#### `jobs.js`
**Purpose**: Manages the construction of mining jobs (Block Templates).
**Key Functions**:
- `updateBlockTemplate()`: Polls Bitcoin Core for a new block template (`getblocktemplate`).
- `createJob(tmpl)`: Converts a Bitcoin Core template into a Stratum-compatible job, including Merkle Branch construction.
- `buildMerkleBranch(txIds)`: Helper to build the Merkle tree for share validation.

#### `shares.js`
**Purpose**: Validates shares submitted by miners and tracks hashrate.
**Key Functions**:
- `validateShare(miner, jobId, extraNonce2, nTime, nonce)`: Verifies if a share is valid against the job target and the pool difficulty.
- `submitBlock(...)`: Submits a valid block to the Bitcoin network if the share meets the network target.
- `getPoolHashrate()`: Calculates the global pool hashrate based on recent shares.

#### `stratum.js`
**Purpose**: Implements the Stratum V1 TCP Server.
**Key Functions**:
- `start()`: Starts the TCP server on port 3333.
- `handleConnection(socket)`: Manages new TCP connections.
- `handleAuthorize(miner, req)`: Handles `mining.authorize`.
- `handleSubscribe(miner, req)`: Handles `mining.subscribe`.
- `handleSubmit(miner, req)`: Handles `mining.submit` (Share submission).

#### `stratum_v2_translator.js`
**Purpose**: Translates/Simulates Stratum V2 protocol messages for compatibility.
**Key Functions**:
- `start()`: Starts the V2 simulation server on port 3334.
- `handleSetupConnection(...)`: Handles V2 connection setup.
- `handleChannelEndpointAdd(...)`: Handles channel creation.

### External Integrations

#### `rpc.js`
**Purpose**: A clean wrapper around the Bitcoin Core JSON-RPC API.
**Key Functions**:
- `getBlockTemplate(rules)`: Fetches a block template for mining.
- `submitBlock(hex)`: Submits a mined block to the network.
- `validateAddress(address)`: Validates a Bitcoin address.

#### `solana_bridge.js`
**Purpose**: Manages interaction with the Solana blockchain for zBTC interactions.
**Key Functions**:
- `init()`: Connects to Solana RPC and loads the authority wallet.
- `mintZBTC(recipient, amount)`: Mints zBTC tokens to a user's wallet.
- `payoutSPL(recipient, amountSats)`: Transfers SPL tokens as mining rewards.

#### `solana_bridge_sim.js`
**Purpose**: A simulation of the Solana Bridge for development/testing without spending real funds.
**Key Functions**:
- `mintZBTC(...)`: Logs a simulated mint operation.

#### `rewards.js`
**Purpose**: Calculates and tracks miner rewards.
**Key Functions**:
- `addShare(minerId)`: Increments share count for the current round.
- `handleBlockFound(minerId, ...)`: Distributes rewards when a block is found (Proportional distribution).

---

## Frontend (`web/src/`)

The frontend is a React application built with Vite, providing a dashboard for miners.

### Core

#### `App.jsx`
**Purpose**: The main application component that sets up routing and the Wallet Context.
**Key Functions**:
- Routes `/` to `Home` and `/miner/:id` to `MinerStats`.

#### `main.jsx`
**Purpose**: The entry point for React, rendering `App` into the DOM.

### Pages

#### `pages/Home.jsx`
**Purpose**: The landing page of the pool.
**Key Functions**:
- `useEffect` (Polling): Periodically fetches pool stats from `/api/stats`.
- `copyCommand()`: Helper to copy the miner connection string to clipboard.
- Displays global stats (Miners, Hashrate, Height) and the "Start Mining" guide.

#### `pages/MinerStats.jsx`
**Purpose**: A detailed dashboard for a specific miner.
**Key Functions**:
- `useEffect` (Polling): Fetches miner-specific data from `/api/miner/:id`.
- Renders a graph of shares/hashrate over time using `react-chartjs-2`.
- Displays total shares and estimated earnings.

### Components

#### `components/MintZButton.jsx`
**Purpose**: A button that allows users to mint zBTC (for demo/faucet purposes).
**Key Functions**:
- `onMint()`: constructs and sends a Solana transaction to mint zBTC tokens to the connected wallet.

#### `components/StatsCard.jsx`
**Purpose**: A reusable UI component for displaying a single statistic (e.g., "Active Miners").

#### `components/WalletContextProvider.jsx`
**Purpose**: A wrapper component that initializes the Solana Wallet Adapter (Solflare, Phantom, etc.), allowing the app to connect to user wallets.
