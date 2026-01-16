import React from 'react';
import './StatsCard.css';

const StatsCard = ({ title, value, unit, icon }) => {
    return (
        <div className="stats-card">
            <div className="icon-container">{icon}</div>
            <div className="content">
                <h3>{title}</h3>
                <p className="value">
                    {value} <span className="unit">{unit}</span>
                </p>
            </div>
        </div>
    );
};

export default StatsCard;
