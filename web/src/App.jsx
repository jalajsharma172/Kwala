import { useState, useEffect } from 'react'
import './App.css'
import StatsCard from './components/StatsCard'
import { WalletContextProvider } from './components/WalletContextProvider';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { MintZButton } from './components/MintZButton';

function App() {
  const [stats, setStats] = useState({
    miners: 0,
    hashrate: "0 H/s",
    blockHeight: "Loading...",
    solanaPayouts: "Active"
  });

  const [poolIp, setPoolIp] = useState("localhost");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // 1. Determine Pool IP (for display command)
    setPoolIp(window.location.hostname);

    // 2. Poll API
    const fetchStats = async () => {
      try {
        const res = await fetch(`http://${window.location.hostname}:3001/api/stats`);
        const data = await res.json();
        setStats({
          miners: data.miners,
          hashrate: data.hashrate,
          blockHeight: data.blockHeight.toLocaleString(),
          solanaPayouts: "Active"
        });
      } catch (e) {
        console.error("API Error", e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);

    // 3. Scroll Handler
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);

    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const copyCommand = () => {
    const cmd = `./cpuminer -a sha256d -o stratum+tcp://${poolIp}:3333 -u Miner1 -p x,solanaAddress=...`;
    navigator.clipboard.writeText(cmd);
    alert("Miner command copied!");
  };

  return (
    <WalletContextProvider>
      <div className="app-container">

        {/* Navigation */}
        <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
          <div className="nav-brand">AXON<span className="text-gradient">POOL</span></div>
          <WalletMultiButton />
        </nav>

        {/* Hero Section with Video Background */}
        <section className="hero-section">
          {/* Local Video Asset */}
          <video
            autoPlay
            loop
            muted
            playsInline
            className="video-bg"
            src="/tput.mp4"
          />

          <div className="hero-overlay"></div>

          <div className="hero-content">
            <h1 className="hero-title">
              Mine Bitcoin. <br />
              Earn <span className="text-gradient">Solana.</span>
            </h1>
            <p className="hero-subtitle">
              The world's first high-performance mining pool with instant cross-chain payouts.
              Join the revolution today.
              <br />
              <span style={{ fontSize: '0.9rem', opacity: 0.8, marginTop: '10px', display: 'block' }}>
                Designed by Axon Team
              </span>
            </p>

            <div className="hero-btns">
              <button className="btn-primary" onClick={() => window.scrollTo(0, 800)}>Start Mining</button>
              <MintZButton />
            </div>
          </div>

          {/* Floating Stats Bar (Overlapping Video) */}
          <div className="stats-floating-bar">
            <div className="glass-panel stats-card">
              <StatsCard title="ACTIVE MINERS" value={stats.miners} unit="Workers" icon="⛏️" />
            </div>
            <div className="glass-panel stats-card">
              <StatsCard title="POOL HASHRATE" value={stats.hashrate} unit="" icon="🚀" />
            </div>
            <div className="glass-panel stats-card">
              <StatsCard title="NETWORK HEIGHT" value={stats.blockHeight} unit="Blocks" icon="🔗" />
            </div>
          </div>

        </section>

        {/* Connection Guide */}
        <section className="guide-section">
          <div className="hero-content" style={{ margin: '0 auto' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>Connect Your Miner</h2>
            <p style={{ color: '#9ca3af' }}>Use any Stratum V1 compatible miner (CPUMiner, CGMiner) to connect.</p>

            <div className="terminal-box">
              <button className="copy-btn" onClick={copyCommand}>Copy</button>
              <p>$ ./cpuminer -a sha256d -o stratum+tcp://{poolIp}:3333 -u YourID -p x,solanaAddress=YOUR_SOL_KEY</p>
            </div>
          </div>
        </section>

      </div>
    </WalletContextProvider>
  )
}

export default App
