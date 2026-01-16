import React, { useState, useEffect } from 'react';
import StatsCard from './components/StatsCard';
import './App.css';

function App() {
  const [stats, setStats] = useState({
    miners: 0,
    hashrate: '...',
    blockHeight: 0,
    network: '...',
    poolAddress: '...',
    solanaEnabled: false
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/stats');
      const data = await res.json();
      setStats(data);
      setLoading(false);
    } catch (e) {
      console.error("API Error", e);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000); // Poll every 2s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <span className="logo-icon">⚡</span> AXON POOL
        </div>
        <div className="status-badge">
          <span className={`dot ${loading ? 'orange' : 'green'}`}></span>
          {loading ? 'Connecting...' : 'Online'}
        </div>
      </header>

      <main className="main-content">
        <div className="hero-section">
          <h1>Mine Bitcoin. <br /> Earn <span className="highlight">Solana</span>.</h1>
          <p className="subtitle">High performance non-custodial mining pool with instant cross-chain payouts.</p>
        </div>

        <div className="stats-grid">
          <StatsCard
            title="Active Miners"
            value={stats.miners}
            unit="Workers"
            icon="⛏️"
          />
          <StatsCard
            title="Pool Hashrate"
            value={stats.hashrate}
            unit=""
            icon="🚀"
          />
          <StatsCard
            title="Network Height"
            value={stats.blockHeight.toLocaleString()}
            unit="Blocks"
            icon="🔗"
          />
          <StatsCard
            title="Solana Payouts"
            value={stats.solanaEnabled ? "Active" : "Disabled"}
            unit=""
            icon="◎"
          />
        </div>

        <div className="connection-info">
          <h2>Connect Your Miner</h2>
          <div className="code-block">
            <div className="command-line">
              <span className="prompt">$</span> ./cpuminer -a sha256d -o stratum+tcp://{window.location.hostname}:3333 -u your_solana_address -p x
            </div>
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(`./cpuminer -a sha256d -o stratum+tcp://${window.location.hostname}:3333 -u wallet -p x`)}>
              Copy
            </button>
          </div>
          <div className="features">
            <div className="feature">
              <h3>Stratum V1 & V2</h3>
              <p>Support for legacy and next-gen mining protocols.</p>
            </div>
            <div className="feature">
              <h3>Instant Payouts</h3>
              <p>Rewards sent to your Solana wallet immediately upon block discovery.</p>
            </div>
            <div className="feature">
              <h3>Testnet Sandbox</h3>
              <p>Risk-free environment to test your mining setup.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="footer">
        <p>Axon Pool &copy; 2026. Running on Bitcoin {stats.network}.</p>
      </footer>
    </div>
  );
}

export default App;
