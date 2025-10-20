import React from 'react';
import { Link } from 'react-router-dom';

const SavedForecasts = ({ forecasts }) => {
  return (
    <div className="saved-forecasts">
      <h2 className="text-2xl font-bold mb-4">Saved Forecasts</h2>
      {forecasts.length === 0 ? (
        <p>No saved forecasts yet.</p>
      ) : (
        <ul>
          {forecasts.map((forecast, index) => (
            <li key={index} className="mb-2">
              <Link to={`/manipulate/${index}`} className="text-blue-500 hover:underline">
                {forecast.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SavedForecasts;

