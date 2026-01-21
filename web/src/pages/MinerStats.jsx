import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function MinerStats() {
    const { id } = useParams();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Adjust URL if backend is on different port locally, but typically proxied or hardcoded?
                // Assuming Vite proxy or CORS enabled on 3001.
                // The user's server is on 3001. Frontend 5173.
                // We should use full URL or configure proxy.
                // For MVP, hardcode localhost:3001 or relative if proxy setup.
                // Let's use localhost:3001 to be safe, assuming CORS is enabled in server.js (It is).
                const response = await fetch(`http://localhost:3001/api/miner/${id}`);
                if (!response.ok) throw new Error('Miner not found');
                const data = await response.json();
                setStats(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
        // Refresh every minute
        const interval = setInterval(fetchStats, 60000);
        return () => clearInterval(interval);
    }, [id]);

    if (loading) return <div className="p-8 text-white">Loading stats...</div>;
    if (error) return <div className="p-8 text-red-500">Error: {error}</div>;
    if (!stats) return null;

    // Process Graph Data
    const graphData = {
        labels: stats.graphData.map(d => new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        datasets: [
            {
                label: 'Shares per Minute',
                data: stats.graphData.map(d => d.count),
                borderColor: '#4ade80',
                backgroundColor: 'rgba(74, 222, 128, 0.5)',
                tension: 0.3,
            },
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: { position: 'top', labels: { color: '#9ca3af' } },
            title: { display: false },
        },
        scales: {
            x: {
                grid: { color: '#374151' },
                ticks: { color: '#9ca3af' }
            },
            y: {
                beginAtZero: true,
                grid: { color: '#374151' },
                ticks: { color: '#9ca3af' }
            }
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-8 text-green-400">Miner Stats: {stats.minerId}</h1>

                <div className="grid gap-6 mb-8 grid-cols-1 md:grid-cols-2">
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                        <div className="text-sm text-gray-400 uppercase tracking-wider mb-2">Total Valid Shares</div>
                        <div className="text-5xl font-bold">{stats.totalShares}</div>
                    </div>

                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                        <div className="text-sm text-gray-400 uppercase tracking-wider mb-2">Est. Earnings (BTC)</div>
                        {/* 1 share = 0.000000000039 BTC */}
                        <div className="text-5xl font-bold text-yellow-400">
                            {(stats.totalShares * 0.000000000039).toFixed(12)}
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
                    <div className="text-sm text-gray-400 uppercase tracking-wider mb-4">Activity (Last 60 Mins)</div>
                    <div className="h-64">
                        <Line options={options} data={graphData} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MinerStats;
