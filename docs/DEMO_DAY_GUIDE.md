# 🏆 Axon Pool: Demo Day Job Sheet

Use this guide for the face-to-face demonstration with judges. This setup runs the pool on one "Host" laptop and allows "Client" laptops (or the same one) to connect as miners.

---

## 1. The Network Setup
*   **WiFi**: Connect ALL laptops (Host + Miners) to the **SAME WiFi Network** (or use your Phone Hotspot).
*   **Identify Host IP**:
    *   Open Terminal on Host.
    *   Run `ipconfig` (Windows) or `ifconfig` (Linux/Mac).
    *   Note the **IPv4 Address** (e.g., `192.168.1.5`).

---

## 2. The Firewall (CRITICAL 🛑)
Windows Firewall often **BLOCKS** incoming connections from other laptops by default.

**On the HOST Laptop:**
1.  Open **Windows Security** -> **Firewall & network protection**.
2.  Check your "Active" network (Private or Public).
3.  **Turn OFF** the firewall for the active profile *temporarily* for the demo.
4.  *(Alternatively)*: Allow TCP Ports `3333` (Mining) and `5174` (Website) and `3001` (API).

---

## 3. Host Laptop Instructions (The Server)
Run these in separate terminals:

**Terminal 1: Bitcoin Core**
```bash
bitcoind -testnet -daemon
```

**Terminal 2: Axon Pool (Backend)**
```bash
npm start
```
*Wait for "Stratum Server listening..."*

**Terminal 3: Frontend Dashboard**
```bash
cd web
npm run dev -- --host
```
*The `--host` flag is crucial! It allows other laptops to visit the website.*

---

## 4. Miner Laptop Instructions (The Workers)
On any laptop (Host or another device):

**Command:**
Replace `<HOST_IP>` with the IP you found in Step 1.

```bash
./cpuminer -a sha256d -o stratum+tcp://<HOST_IP>:3333 -u Judge1 -p x,solanaAddress=C7U4EaBhqxswvihnr6zjFUsy57qvDNYpsboCLHAbBRtC
```

**Example:**
`./cpuminer ... -o stratum+tcp://192.168.1.5:3333 ...`

---

## 5. Viewing the Dashboard
On any laptop connected to the WiFi:

1.  Open Browser.
2.  Go to `http://<HOST_IP>:5174`
    *   Example: `http://192.168.1.5:5174`

You should see the live **Hashrate** and **Active Miners** increase as the miner laptops start working!
