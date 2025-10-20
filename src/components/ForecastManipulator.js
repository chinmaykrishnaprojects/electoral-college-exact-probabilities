import { scaleLinear } from 'd3-scale';
import React, { useState } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import allStates from '../data/allstates.json';

const geoUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const colorScale = scaleLinear()
  .domain([0, 50, 100])
  .range(["#0000ff", "#ffffff", "#ff0000"]);

const ForecastManipulator = ({ forecasts, selectedForecast, setSelectedForecast, onBack }) => {
  const [updatedStates, setUpdatedStates] = useState({});

  const handleForecastChange = (e) => {
    const newForecast = forecasts.find(f => f.name === e.target.value);
    setSelectedForecast(newForecast);
    setUpdatedStates({});
  };

  const handleStateClick = (stateName) => {
    setUpdatedStates(prev => {
      const currentProb = prev[stateName] !== undefined ? prev[stateName] : 
        calculateProbability(selectedForecast.states.find(s => s.stateName === stateName).defaultAngle);
      const newProb = currentProb > 50 ? 0 : currentProb < 50 ? 100 : 50;
      return { ...prev, [stateName]: newProb };
    });
  };

  const getStateColor = (stateName) => {
    const stateData = selectedForecast.states.find(s => s.stateName === stateName);
    if (!stateData) return "#ECEFF1"; // Default color for states not in the forecast
    const prob = updatedStates[stateName] !== undefined ? updatedStates[stateName] : 
      calculateProbability(stateData.defaultAngle);
    return colorScale(prob);
  };

  const calculateProbability = (angle) => {
    return Math.pow(Math.sin((angle + 90) / 2 * Math.PI / 180), 2) * 100;
  };

  const formatProbability = (prob) => {
    return prob > 50 ? `${prob.toFixed(1)}% R` : `${(100 - prob).toFixed(1)}% D`;
  };

  return (
    <div className="forecast-manipulator p-4 w-full">
      <div className="flex items-center mb-4">
        <h2 className="text-2xl font-bold mr-4">Forecast Manipulator:</h2>
        <select
          value={selectedForecast.name}
          onChange={handleForecastChange}
          className="border border-gray-300 rounded px-2 py-1"
        >
          {forecasts.map((forecast, index) => (
            <option key={index} value={forecast.name}>{forecast.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col lg:flex-row">
        <div className="w-full lg:w-3/4 mb-4 lg:mb-0">
          <ComposableMap projection="geoAlbersUsa" width={980} height={500}>
            <Geographies geography={geoUrl}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const cur = allStates.find(s => s.val === geo.id);
                  if (!cur) return null;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onClick={() => handleStateClick(cur.id)}
                      fill={getStateColor(cur.id)}
                      stroke="#FFFFFF"
                      strokeWidth={0.5}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        </div>
        <div className="w-full lg:w-1/4 lg:pl-4">
          <h3 className="text-xl font-bold mb-2">State Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-200">
                  <th className="border p-2">State</th>
                  <th className="border p-2">Probability</th>
                  <th className="border p-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {selectedForecast.states.map(state => {
                  const prob = calculateProbability(state.defaultAngle);
                  const updatedProb = updatedStates[state.stateName] !== undefined ? updatedStates[state.stateName] : prob;
                  return (
                    <tr key={state.stateName}>
                      <td className="border p-2">{state.stateName}</td>
                      <td className="border p-2">
                        <div className="flex items-center">
                          <div
                            className="w-[300px] h-[40px] mr-2"
                            style={{ backgroundColor: colorScale(prob) }}
                          ></div>
                          {formatProbability(prob)}
                        </div>
                      </td>
                      <td className="border p-2">
                        <div className="flex items-center">
                          <div
                            className="w-[300px] h-[40px] mr-2"
                            style={{ backgroundColor: colorScale(updatedProb) }}
                          ></div>
                          {formatProbability(updatedProb)}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <button
        onClick={onBack}
        className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Back to Home
      </button>
    </div>
  );
};

export default ForecastManipulator;
