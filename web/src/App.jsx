import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { WalletContextProvider } from './components/WalletContextProvider';
import Home from './pages/Home';
import MinerStats from './pages/MinerStats';
import './App.css';

function App() {
  return (
    <Router>
      <WalletContextProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/miner/:id" element={<MinerStats />} />
        </Routes>
      </WalletContextProvider>
    </Router>
  );
}

export default App;
