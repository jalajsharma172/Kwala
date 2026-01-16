# Mining 101: Understanding the Concepts

This guide explains how Bitcoin mining works, focusing on the roles of the Pool, the Miner, and the mysterious "Difficulty".

---

## 1. The Core Concepts

### 🧩 What is Hashing?
Think of hashing like a **Lock Combination**.
*   The Bitcoin Network gives you a puzzle (a "Block Template").
*   Your job is to guess a random number (called a **Nonce**) that, when combined with the puzzle, opens the lock.
*   You have to guess millions of times per second. `SHA256d` is the math behind this guessing game.

### 🏭 What is a Mining Pool?
Mining alone ("Solo Mining") is like trying to win the Powerball lottery by yourself. You might try for 100 years and never win.
*   **The Pool** is a group of thousands of friends buying tickets together.
*   If *anyone* in the group wins, the prize is split among everyone based on how many tickets (work) they bought.
*   **Axon Pool** manages this group and ensures everyone gets paid fairly (in Solana!).

### 🎟️ What are Shares?
Since you probably won't find the Jackpot Block yourself, how does the Pool know you are working?
*   **Shares** are "Almost Winning Tickets".
*   They don't win the Bitcoin Jackpot, but they prove you are doing the work.
*   The Pool pays you for every valid **Share** you submit.
*   **Hashrate** = (Number of Shares you submit) / (Time). It measures how fast you are guessing.

---

## 2. The "Difficulty" (The Limbo Bar)

This is the most critical and confusing concept. Think of it as a **Limbo Bar**. To "win", you must go *under* the bar.

### 🔴 Network Difficulty (The "Impossible" Floor)
*   **Who sets it?** The Bitcoin Blockchain.
*   **Height**: EXTREMELY LOW (Hard).
*   **Goal**: To find a valid Bitcoin Block, your hash result must be lower than this number.
*   **Chance**: 1 in Trillions.
*   **Analogy**: Hitting a hole-in-one from 500 yards away.

### 🔵 Pool Difficulty (The "Easy" Ceiling)
*   **Who sets it?** The Mining Pool (Us).
*   **Height**: Much Higher (Easier).
*   **Goal**: To submit a **Share**, your hash result needs to be lower than *this* number, but not necessarily the Network number.
*   **Analogy**: Hitting the golf ball onto the green.
*   **Why?** Small miners (CPUs) can't hit a hole-in-one. But they can hit the green frequently. The Pool counts these "on the green" shots (Shares) to calculate your reward.

---

## 3. The Software Roles

### 🧠 Bitcoin Core (`bitcoind`)
*   **Role**: The Accountant & Rule Maker.
*   **What it does**:
    *   Downloads the entire Blockchain (history of all money).
    *   Validates transactions from all over the world.
    *   Creates the "Block Template" (the puzzle) for the pool to solve.
    *   **Analogy**: The Bank Manager who verifies the checks.

### 🏊 The Pool Server (`Axon`)
*   **Role**: The Coordinator.
*   **What it does**:
    *   Talks to Bitcoin Core to get the latest puzzle.
    *   Distributes work to miners.
    *   Checks "Shares" (partial solutions) from miners.
    *   Calculates "Hashrate" (speed).
    *   Pays rewards (sends zBTC via Solana).
    *   **Analogy**: The Foreman at a construction site.

### ⛏️ The CPU Miner (`cpuminer`)
*   **Role**: The Worker.
*   **What it does**:
    *   Connects to the Pool.
    *   Takes the puzzle and starts guessing numbers (Hashing) as fast as possible.
    *   When it finds a result below the "Pool Difficulty", it sends it back ("I found a Share!").
    *   **Analogy**: The guy swinging the pickaxe.

---

## Summary Diagram

```text
[ Bitcoin Network ] 
       | (Rules & Diff)
       v
[ Bitcoin Core ] <-- "Give me work!"
       |
[ Axon Pool ]    <-- "Here is an easier version of the work."
       | (Pool Diff)
       v
[ CPU Miner ]    --> "I found a Share!" (Partial Solution)
```

---

## 4. The Reward Scenario (Who gets paid?)

**Question**: *If 5 miners work for 10 days and stop, and then 2 new miners start on Day 11 and find a block, who gets the money?*

This depends on the **Payout Scheme**:

### 🍰 Proportional (PROP)
*   The pool looks at **every share** submitted since the *last* block found.
*   **Result**: The 5 miners from Days 1-10 did 99% of the work.
*   **Payout**: The 5 old miners get 99% of the reward (even if offline). The 2 new miners get almost nothing.

### ⏱️ Pay Per Last N Shares (PPLNS) (Currently Used)
*   The pool only counts the **Total Last X Shares** (the most recent work).
*   **Result**: The old work from Days 1-10 might have "expired" or been pushed out of the window.
*   **Payout**: The 2 active miners likely get the majority of the reward because they are doing the work *now*.

**Axon Pool Note**: Currently, we use a simple memory-based tracker. If the server restarts, old shares are lost, 
acting more like PPLNS where only recent/active miners get paid.
