import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import React, { useEffect, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ForecastManipulator from './components/ForecastManipulator';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  LineController
);

function logGamma(x) {
  const p = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  let sum = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) {
    sum += p[i] / (x + i);
  }

  const t = x + p.length - 1.5;
  return Math.log(Math.sqrt(2 * Math.PI)) + (x - 0.5) * Math.log(t) - t + Math.log(sum);
}

function betaCDF(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  
  // Handle edge cases for a and b
  if (a === 0) return 1; // Always 1 when a is 0
  if (b === 0) return 0; // Always 0 when b is 0

  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaContinuedFraction(x, a, b) / a;
  } else {
    return 1 - bt * betaContinuedFraction(1 - x, b, a) / b;
  }
}

function betaContinuedFraction(x, a, b) {
  const MAX_ITERATIONS = 200;
  const EPSILON = 3e-7;

  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < EPSILON) d = EPSILON;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    let m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < EPSILON) d = EPSILON;
    c = 1 + aa / c;
    if (Math.abs(c) < EPSILON) c = EPSILON;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < EPSILON) d = EPSILON;
    c = 1 + aa / c;
    if (Math.abs(c) < EPSILON) c = EPSILON;
    d = 1 / d;
    let del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPSILON) break;
  }

  return h;
}

const NeedleComponent = ({ stateName, evs, defaultAngle, correlation, onAngleChange, onCorrelationChange, useGlobalCorrelation }) => {
  const [angle, setAngle] = useState(defaultAngle);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const RADIUS = 120;
  const TICK_LENGTH = RADIUS * 0.1;
  const NUM_TICKS = 31;

  const sectors = [
    { color: '#d22532', label: 'SAFE R' },
    { color: '#ff8b98', label: 'LEAN R' },
    { color: '#c9c09b', label: 'TOSSUP' },
    { color: '#8aafff', label: 'LEAN D' },
    { color: '#244999', label: 'SAFE D' },
  ];

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.bottom;
        const deltaX = e.clientX - centerX;
        const deltaY = centerY - e.clientY;

        let newAngle;
        if (deltaY < 0) {
          newAngle = 90 * Math.sign(deltaX);
        } else {
          newAngle = 90 - Math.atan2(deltaY, deltaX) * (180 / Math.PI);
        }

        newAngle = Math.max(-90, Math.min(90, newAngle));
        setAngle(newAngle);
        onAngleChange(stateName, newAngle);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onAngleChange, stateName]);

  const handleMouseDown = () => {
    setIsDragging(true);
  };

  const getPercentage = () => {
    return Math.pow(Math.sin((angle + 90) / 2 * Math.PI / 180), 2) * 100;
  };

  const prob = getPercentage();
  const blueWidth = RADIUS * Math.sqrt(1 - prob / 100);
  const redWidth = RADIUS * Math.sqrt(prob / 100);

  let probDisplay = '50.0%';
  if (prob > 50.05) {
    probDisplay = `${Math.round(prob * 10) / 10}% R`;
  } else if (prob < 49.95) {
    probDisplay = `${Math.round(1000 - prob * 10) / 10}% D`;
  }

  const handleTickClick = (tickAngle) => {
    const needleAngle = 90 - tickAngle;
    setAngle(needleAngle);
    onAngleChange(stateName, needleAngle);
  };

  const renderTicks = () => {
    const ticks = [];
    const angleStep = 180 / (NUM_TICKS - 1);

    for (let i = 0; i < NUM_TICKS; i++) {
      const tickAngle = i * angleStep;
      const majorTickX1 = RADIUS + RADIUS * Math.cos(tickAngle * (Math.PI / 180));
      const majorTickY1 = RADIUS - RADIUS * Math.sin(tickAngle * (Math.PI / 180));
      const majorTickX2 = RADIUS + (RADIUS - TICK_LENGTH) * Math.cos(tickAngle * (Math.PI / 180));
      const majorTickY2 = RADIUS - (RADIUS - TICK_LENGTH) * Math.sin(tickAngle * (Math.PI / 180));

      ticks.push(
        <line
          key={`major-${i}`}
          x1={majorTickX1}
          y1={majorTickY1}
          x2={majorTickX2}
          y2={majorTickY2}
          stroke="black"
          strokeWidth="2"
          onClick={() => handleTickClick(tickAngle)}
        />
      );

      if (i < NUM_TICKS - 1) {
        const nextTickAngle = (i + 1) * angleStep;
        const minorTickAngle = (tickAngle + nextTickAngle) / 2;
        const minorTickX1 = RADIUS + RADIUS * Math.cos(minorTickAngle * (Math.PI / 180));
        const minorTickY1 = RADIUS - RADIUS * Math.sin(minorTickAngle * (Math.PI / 180));
        const minorTickX2 = RADIUS + (RADIUS - TICK_LENGTH * 0.8) * Math.cos(minorTickAngle * (Math.PI / 180));
        const minorTickY2 = RADIUS - (RADIUS - TICK_LENGTH * 0.8) * Math.sin(minorTickAngle * (Math.PI / 180));

        ticks.push(
          <line
            key={`minor-${i}`}
            x1={minorTickX1}
            y1={minorTickY1}
            x2={minorTickX2}
            y2={minorTickY2}
            stroke="grey"
            strokeWidth="1.5"
            onClick={() => handleTickClick(minorTickAngle)}
          />
        );
      }
    }

    return ticks;
  };

  const renderSectors = () => {
    const sectorElements = [];
    const sectorAngle = 36;
    const innerRadius = RADIUS * 0.4;

    for (let i = 0; i < sectors.length; i++) {
      const startAngle = i * sectorAngle;
      const endAngle = startAngle + sectorAngle;
      const largeArcFlag = sectorAngle > 180 ? 1 : 0;

      const x1 = RADIUS + RADIUS * Math.cos(startAngle * Math.PI / 180);
      const y1 = RADIUS - RADIUS * Math.sin(startAngle * Math.PI / 180);
      const x2 = RADIUS + RADIUS * Math.cos(endAngle * Math.PI / 180);
      const y2 = RADIUS - RADIUS * Math.sin(endAngle * Math.PI / 180);

      const x3 = RADIUS + innerRadius * Math.cos(endAngle * Math.PI / 180);
      const y3 = RADIUS - innerRadius * Math.sin(endAngle * Math.PI / 180);
      const x4 = RADIUS + innerRadius * Math.cos(startAngle * Math.PI / 180);
      const y4 = RADIUS - innerRadius * Math.sin(startAngle * Math.PI / 180);

      const path = `
        M ${x1} ${y1} 
        A ${RADIUS} ${RADIUS} 0 ${largeArcFlag} 0 ${x2} ${y2}
        L ${x3} ${y3}
        A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${x4} ${y4}
        Z
      `;

      sectorElements.push(
        <React.Fragment key={`sector-${i}`}>
          <path d={path} fill={sectors[i].color} />
          <text
            x={RADIUS + (RADIUS + innerRadius) / 2 * Math.cos((i * sectorAngle + sectorAngle / 2) * Math.PI / 180)}
            y={RADIUS - (RADIUS + innerRadius) / 2 * Math.sin((i * sectorAngle + sectorAngle / 2) * Math.PI / 180)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="10"
            fill="white"
            style={{ userSelect: 'none' }}
          >
            {sectors[i].label}
          </text>
        </React.Fragment>
      );
    }

    return sectorElements;
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="text-base font-bold mb-1">
        <span title={`${stateName}: ${prob > 50 ? prob.toFixed(6) : (100 - prob).toFixed(6)}%`}>
          {stateName}: {prob > 50 ? probDisplay : `${(100 - prob).toFixed(1)}% D`}
        </span>
      </div>

      <div
        ref={containerRef}
        className="relative mb-4"
        style={{ width: RADIUS * 2, height: RADIUS }}
        onMouseDown={handleMouseDown}
      >
        <svg
          className="absolute"
          width={RADIUS * 2}
          height={RADIUS}
          style={{ overflow: 'visible' }}
        >
          {renderSectors()}

          <path
            d={`M 0 ${RADIUS} A ${RADIUS} ${RADIUS} 0 0 1 ${RADIUS * 2} ${RADIUS}`}
            fill="none"
            stroke="#ccc"
            strokeWidth="4"
          />

          {renderTicks()}

          <text
            x={RADIUS}
            y={RADIUS * 0.75}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="16"
            fill="black"
            style={{ userSelect: 'none' }}
          >
            {evs} EVs
          </text>
        </svg>

        <div
          className="absolute bottom-0 left-1/2 origin-bottom"
          style={{
            transform: `translateX(-50%) rotate(${angle}deg)`,
            width: 2,
            height: RADIUS,
          }}
        >
          <div className="w-full h-full bg-gray-700" />
        </div>

        <div className="absolute top-full left-1/2 transform -translate-x-1/2 flex">
          <div
            className="bg-blue-500"
            style={{
              width: `${blueWidth}px`,
              height: `${blueWidth}px`,
              position: 'absolute',
              right: 0,
              top: 0,
            }}
          />

          <div
            className="bg-red-500"
            style={{
              width: `${redWidth}px`,
              height: `${redWidth}px`,
              position: 'absolute',
              left: 0,
              top: 0,
            }}
          />
        </div>

        <div
          className="absolute bg-black rounded-full"
          style={{
            width: 12,
            height: 12,
            top: RADIUS - 6,
            left: RADIUS - 6,
          }}
        />
      </div>

      {!useGlobalCorrelation && (
        <div className="w-full mt-[125px]">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={correlation}
            onChange={(e) => onCorrelationChange(stateName, parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="text-xs text-center">
            Correlation: {correlation.toFixed(2)}
          </div>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [states, setStates] = useState([
    { stateName: 'ME', evs: 2, defaultAngle: -54, correlation: 0.5 },
    { stateName: 'NM', evs: 5, defaultAngle: -54, correlation: 0.5 },
    { stateName: 'VA', evs: 13, defaultAngle: -54, correlation: 0.5 },
    { stateName: 'NE-2', evs: 1, defaultAngle: -54, correlation: 0.5 },
    { stateName: 'NH', evs: 4, defaultAngle: -54, correlation: 0.5 },
    { stateName: 'MN', evs: 10, defaultAngle: -54, correlation: 0.5 },
    { stateName: 'WI', evs: 10, defaultAngle: 0, correlation: 0.5 },
    { stateName: 'MI', evs: 15, defaultAngle: 0, correlation: 0.5 },
    { stateName: 'NV', evs: 6, defaultAngle: 0, correlation: 0.5 },
    { stateName: 'PA', evs: 19, defaultAngle: 0, correlation: 0.5 },
    { stateName: 'NC', evs: 16, defaultAngle: 0, correlation: 0.5 },
    { stateName: 'GA', evs: 16, defaultAngle: 0, correlation: 0.5 },
    { stateName: 'AZ', evs: 11, defaultAngle: 0, correlation: 0.5 },
    { stateName: 'FL', evs: 30, defaultAngle: 54, correlation: 0.5 },
    { stateName: 'ME-2', evs: 1, defaultAngle: 54, correlation: 0.5 },
    { stateName: 'TX', evs: 40, defaultAngle: 54, correlation: 0.5 },
    { stateName: 'IA', evs: 6, defaultAngle: 54, correlation: 0.5 },
    { stateName: 'OH', evs: 17, defaultAngle: 54, correlation: 0.5 },
    { stateName: 'AK', evs: 3, defaultAngle: 54, correlation: 0.5 },
  ]);
  const [globalCorrelation, setGlobalCorrelation] = useState(0.5);
  const [useGlobalCorrelation, setUseGlobalCorrelation] = useState(true);
  const [savedForecasts, setSavedForecasts] = useState([]);
  const [forecastName, setForecastName] = useState('');
  const [selectedForecast, setSelectedForecast] = useState(null);
  const [needleKey, setNeedleKey] = useState(0);
  const [showManipulator, setShowManipulator] = useState(false);
  const [selectedStates, setSelectedStates] = useState({});
  const [scenarioProbability, setScenarioProbability] = useState(0);

  const calculateAverageEVs = () => {
    let demEVs = 191;
    let repEVs = 122;

    states.forEach((state) => {
      const percentage =
        100*Math.pow(Math.sin((state.defaultAngle + 90) / 2 * Math.PI / 180),
        2
      );
      repEVs += state.evs * (percentage / 100);
      demEVs += state.evs * (1 - percentage / 100);
    });

    return { demEVs, repEVs };
  };

  const calculateHistogram = () => {
    let demPDF = Array(538).fill(0);
    let repPDF = Array(538).fill(0);

    for (let scenario = 0; scenario < 1024; scenario++) {
      let scenarioDemPDF = Array(538).fill(0);
      scenarioDemPDF[191] = 1;

      let scenarioRepPDF = Array(538).fill(0);
      scenarioRepPDF[122] = 1;

      states.forEach((state) => {
        const x_i = (scenario + Math.random()) / 1024;
        const prob = Math.pow(
          Math.sin((state.defaultAngle + 90) / 2 * Math.PI / 180),
          2
        );
        const n = state.correlation === 0 ? 0 : 1 / (1 / state.correlation - 1);
        const alpha = n * prob;
        const beta = n * (1 - prob);
        let stateProb;
        if (state.correlation === 0) {
          stateProb = prob;
        } else if (state.correlation === 1) {
          stateProb = x_i < 1 - prob ? 0 : 1;
        } else {
          stateProb = 1 - betaCDF(1 - x_i, alpha, beta);
        }

        const newScenarioDemPDF = Array(538).fill(0);
        const newScenarioRepPDF = Array(538).fill(0);

        for (let i = 0; i < 538; i++) {
          if (scenarioDemPDF[i] > 0) {
            newScenarioDemPDF[i] += scenarioDemPDF[i] * stateProb;
            if (i + state.evs < 538) {
              newScenarioDemPDF[i + state.evs] += scenarioDemPDF[i] * (1 - stateProb);
            }
          }

          if (scenarioRepPDF[i] > 0) {
            newScenarioRepPDF[i] += scenarioRepPDF[i] * (1 - stateProb);
            if (i + state.evs < 538) {
              newScenarioRepPDF[i + state.evs] += scenarioRepPDF[i] * stateProb;
            }
          }
        }

        scenarioDemPDF = newScenarioDemPDF;
        scenarioRepPDF = newScenarioRepPDF;
      });

      // Add this scenario's PDFs to the overall PDFs
      for (let i = 0; i < 538; i++) {
        demPDF[i] += scenarioDemPDF[i];
        repPDF[i] += scenarioRepPDF[i];
      }
    }

    // Average the PDFs
    for (let i = 0; i < 538; i++) {
      demPDF[i] /= 1024;
      repPDF[i] /= 1024;
    }

    return { demPDF, repPDF };
  };

  const [averageEVs, setAverageEVs] = useState(calculateAverageEVs());
  const [histogramData, setHistogramData] = useState(calculateHistogram());

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    setAverageEVs(calculateAverageEVs());
    setHistogramData(calculateHistogram());
    setScenarioProbability(calculateScenarioProbability());
  }, [states, selectedStates]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const handleAngleChange = (stateName, newAngle) => {
    setStates((prevStates) =>
      prevStates.map((state) =>
        state.stateName === stateName
          ? { ...state, defaultAngle: newAngle }
          : state
      )
    );
  };

  const handleCorrelationChange = (stateName, newCorrelation) => {
    setStates((prevStates) =>
      prevStates.map((state) =>
        state.stateName === stateName
          ? { ...state, correlation: newCorrelation }
          : state
      )
    );
  };

  const handleGlobalCorrelationChange = (newCorrelation) => {
    setGlobalCorrelation(newCorrelation);
    if (useGlobalCorrelation) {
      setStates(prevStates => prevStates.map(state => ({...state, correlation: newCorrelation})));
    }
  };

  const handleUseGlobalCorrelationChange = (useGlobal) => {
    setUseGlobalCorrelation(useGlobal);
    if (useGlobal) {
      setStates(prevStates => prevStates.map(state => ({...state, correlation: globalCorrelation})));
    }
  };

  const getChartOptions = (party, isCDF) => ({
    responsive: true,
    maintainAspectRatio: false,
    height: 400,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: `${party} EV Distribution (${isCDF ? 'CDF' : 'PDF'})`,
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const ev = context.label;
            const prob = context.parsed.y;
            return `EVs: ${ev}\nProbability: ${(prob * 100).toFixed(1)}%`; 
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: `${party} Electoral Votes`,
        },
        min: 100,
        max: 438,
      },
      y: {
        title: {
          display: true,
          text: isCDF ? 'Probability of at most' : 'Probability of exactly',
        },
        ticks: {
          callback: (value) => `${(value * 100).toFixed(1)}%`, 
        },
        max: isCDF ? 1 : undefined,
      },
    },
  });

  const getChartData = (party, isCDF) => {
    const pdf = party === 'Democratic' ? histogramData.demPDF : histogramData.repPDF;
    const data = isCDF 
      ? pdf.map((_, i, arr) => arr.slice(0, i + 1).reduce((a, b) => a + b, 0))
      : pdf;

    return {
      labels: Array.from({ length: 538 }, (_, i) => i),
      datasets: [
        {
          label: party,
          data: data,
          backgroundColor: (context) => {
            const index = context.dataIndex;
            if (party === 'Democratic') {
              return index >= 270 ? 'rgba(53, 162, 235, 0.5)' : 'rgba(255, 99, 132, 0.5)';
            } else {
              return index <= 268 ? 'rgba(53, 162, 235, 0.5)' : 'rgba(255, 99, 132, 0.5)';
            }
          },
        },
        {
          label: `${party} Win Line`,
          data: Array(538)
            .fill(null)
            .map((_, i) => (i === (party === 'Democratic' ? 269.5 : 268.5) ? 1 : null)),
          borderColor: party === 'Democratic' ? 'blue' : 'red',
          borderWidth: 2,
          type: 'line',
          fill: false,
          pointRadius: 0, 
        },
      ],
    };
  };

  let demWinProb = 0;
  for (let i = 270; i < 538; i++) {
    demWinProb += histogramData.demPDF[i];
  }
  demWinProb = demWinProb * 100;

  let repWinProb = 100 - demWinProb;

  const saveForecast = () => {
    if (savedForecasts.length >= 5) {
      toast.error('You can only save up to 5 forecasts');
      return;
    }

    if (!forecastName.trim()) {
      toast.error('Please enter a name for your forecast');
      return;
    }

    const newForecast = {
      name: forecastName,
      states: states.map(state => ({
        stateName: state.stateName,
        evs: state.evs,
        defaultAngle: state.defaultAngle,
        correlation: state.correlation
      })),
      globalCorrelation: globalCorrelation,
      useGlobalCorrelation: useGlobalCorrelation
    };

    setSavedForecasts([...savedForecasts, newForecast]);
    setForecastName('');
    toast.success('Forecast saved successfully');
  };

  const handleForecastSelect = (forecast) => {
    console.log("Selected forecast:", forecast);
    setSelectedForecast(forecast);
    setStates(forecast.states);
    setGlobalCorrelation(forecast.globalCorrelation);
    setUseGlobalCorrelation(forecast.useGlobalCorrelation);
    setNeedleKey(prevKey => prevKey + 1); // Force needle re-render
  };

  const handleSelectionChange = (stateName, selection) => {
    setSelectedStates((prev) => ({
      ...prev,
      [stateName]: prev[stateName] === selection ? 'N' : selection, // Toggle selection
    }));
  };

  const getPercentage = (angle) => {
    return Math.pow(Math.sin((angle + 90) / 2 * Math.PI / 180), 2) * 100;
  };

  const handleManipulateForecast = (e) => {
    e.preventDefault();
    if (selectedForecast) {
      console.log("Showing ForecastManipulator");
      setShowManipulator(true);
    } else {
      console.log("No forecast selected");
    }
  };

  const calculateScenarioProbability = () => {
    const samples = 16384;
    let integralSum = 0;
    for (let i = 0; i < samples; i++) {
      const scenario = (i + Math.random()) / samples;
      let product = 1;
      states.forEach((state) => {
        const x_i = scenario + Math.random() / samples;
        const prob = Math.pow(Math.sin((state.defaultAngle + 90) / 2 * Math.PI / 180), 2);
        const n = state.correlation === 0 ? 0 : 1 / (1 / state.correlation - 1);
        const alpha = n * (1 - prob);
        const beta = n * (prob);
        let stateProb;
        if (state.correlation === 0) {
          stateProb = prob;
        } else if (state.correlation === 1) {
          stateProb = x_i < 1 - prob ? 0 : 1;
        } else {
          stateProb = betaCDF(x_i, alpha, beta);
        }
        product *= selectedStates[state.stateName] === 'R' ? stateProb : selectedStates[state.stateName] === 'D' ? 1 - stateProb : 1;
      });
      integralSum += product;
    }

    return (integralSum / samples) * 100;
  };

  const scenarioCDFData = {
    labels: Array.from({ length: 101 }, (_, i) => i),
    datasets: [
      {
        label: 'Probability by Scenario',
        data: Array.from({ length: 101 }, (_, i) => {
          let product = 1;
          states.forEach((state) => {
            const prob = Math.pow(Math.sin((state.defaultAngle + 90) / 2 * Math.PI / 180), 2);
            const n = state.correlation === 0 ? 0 : 1 / (1 / state.correlation - 1);
            const alpha = n * (1 - prob);
            const beta = n * (prob);
            let stateProb;
            if (state.correlation === 0) {
              stateProb = prob;
            } else if (state.correlation === 1) {
              stateProb = i/100 < 1 - prob ? 0 : 1;
            } else {
              stateProb = betaCDF(i/100, alpha, beta);
            }
            product *= selectedStates[state.stateName] === 'R' ? stateProb : selectedStates[state.stateName] === 'D' ? 1 - stateProb : 1;
          });
          return product;
        }),
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        fill: true,
      },
    ],
  };

  const scenarioCDFOptions = {
      height: 200,
      scales: {
          x: { title: { display: true, text: 'Scenario (Percentile)' } },
          y: { title: { display: true, text: 'Probability' } }
      },
      plugins: {
        title: { display: true, text: 'Scenario Probability Distribution', fontSize: 18 },
      }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 overflow-y-auto px-4">
      <ToastContainer />
      {!showManipulator ? (
        <>
          <h1 className="text-4xl font-bold mb-8">
            Win Probability: <span className="text-black"> </span>
            <span className="text-blue-500" title={`Democratic Win Probability: ${demWinProb.toFixed(6)}%`}>
              {histogramData.demPDF ? demWinProb.toFixed(1) : 'Calculating...'}% D
            </span>
            <span className="text-black"> - </span>
            <span className="text-red-500" title={`Republican Win Probability: ${repWinProb.toFixed(6)}%`}>
              {histogramData.repPDF ? repWinProb.toFixed(1) : 'Calculating...'}% R
            </span>
          </h1>
          <h1 className="text-4xl font-bold mb-8">
            Average Outcome: <span className="text-blue-500" title={`Democratic Average EVs: ${averageEVs.demEVs.toFixed(6)}`}>{averageEVs.demEVs.toFixed(1)} D</span>
            <span className="text-black"> - </span>
            <span className="text-red-500" title={`Republican Average EVs: ${averageEVs.repEVs.toFixed(6)}`}>{averageEVs.repEVs.toFixed(1)} R</span>
          </h1>
          
          {/* Add global correlation controls */}
          <div className="w-full max-w-md mb-8">
            <div className="flex items-center mb-2">
              <input
                type="checkbox"
                checked={useGlobalCorrelation}
                onChange={(e) => handleUseGlobalCorrelationChange(e.target.checked)}
                className="mr-2"
              />
              <label>Use Global Correlation</label>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={globalCorrelation}
              onChange={(e) => handleGlobalCorrelationChange(parseFloat(e.target.value))}
              className="w-full"
              disabled={!useGlobalCorrelation}
            />
            <div className="text-center">
              Global Correlation: {globalCorrelation.toFixed(2)}
            </div>
          </div>
          
          {/* Update the needles */}
          <div className={`grid grid-cols-6 gap-4 mb-8 ${useGlobalCorrelation ? 'pb-[50px]' : 'pb-[0px]'}`}>
            {states.slice(0, 6).map((state) => (
              <NeedleComponent
                key={`${state.stateName}-${needleKey}`}
                {...state}
                onAngleChange={handleAngleChange}
                onCorrelationChange={handleCorrelationChange}
                useGlobalCorrelation={useGlobalCorrelation}
              />
            ))}
          </div>
          <div className={`grid grid-cols-7 gap-4 mb-8 ${useGlobalCorrelation ? 'pb-[50px]' : 'pb-[0px]'}`}>
            {states.slice(6, 13).map((state) => (
              <NeedleComponent
                key={`${state.stateName}-${needleKey}`}
                {...state}
                onAngleChange={handleAngleChange}
                onCorrelationChange={handleCorrelationChange}
                useGlobalCorrelation={useGlobalCorrelation}
              />
            ))}
          </div>
          <div className={`grid grid-cols-6 gap-4 ${useGlobalCorrelation ? 'pb-[100px]' : 'pb-[0px]'}`}>
            {states.slice(13).map((state) => (
              <NeedleComponent
                key={`${state.stateName}-${needleKey}`}
                {...state}
                onAngleChange={handleAngleChange}
                onCorrelationChange={handleCorrelationChange}
                useGlobalCorrelation={useGlobalCorrelation}
              />
            ))}
          </div>

          {/* Keep the charts */}
          <div className="flex flex-col gap-8 w-full" style={{ maxWidth: '1600px' }}>
            <div className="flex gap-8">
              <div className="w-1/2" style={{ height: '400px' }}>
                <Bar
                  options={getChartOptions('Republican', false)}
                  data={getChartData('Republican', false)}
                />
              </div>
              <div className="w-1/2" style={{ height: '400px' }}>
                <Bar
                  options={getChartOptions('Republican', true)}
                  data={getChartData('Republican', true)}
                />
              </div>
            </div>
            <div className="flex gap-8">
              <div className="w-1/2" style={{ height: '400px' }}>
                <Bar
                  options={getChartOptions('Democratic', false)}
                  data={getChartData('Democratic', false)}
                />
              </div>
              <div className="w-1/2" style={{ height: '400px' }}>
                <Bar
                  options={getChartOptions('Democratic', true)}
                  data={getChartData('Democratic', true)}
                />
              </div>
            </div>
          </div>

          {/* Add save forecast functionality */}
          <div className="w-full max-w-md mt-8">
            <h2 className="text-2xl font-bold mb-4">Save Forecast</h2>
            <div className="flex items-center">
              <input
                type="text"
                value={forecastName}
                onChange={(e) => setForecastName(e.target.value)}
                placeholder="Enter forecast name"
                className="border border-gray-300 rounded px-3 py-2 mr-2"
              />
              <button
                onClick={saveForecast}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Save Forecast
              </button>
            </div>
          </div>

          {/* Display saved forecasts */}
          <div className="w-full max-w-md mt-8">
            <h2 className="text-2xl font-bold mb-4">Saved Forecasts</h2>
            <ul className="space-y-2">
              {savedForecasts.map((forecast, index) => (
                <li key={index} className="flex items-center">
                  <button
                    onClick={() => handleForecastSelect(forecast)}
                    className={`px-4 py-2 rounded ${selectedForecast === forecast ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                  >
                    {forecast.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Manipulate forecast button */}
          <div className="w-full max-w-md mt-4 mb-8">
            <h2 className="text-2xl font-bold mb-4 text-center">Forecast Manipulator</h2>
            <button
              className={`px-4 py-2 rounded ${selectedForecast ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
              onClick={handleManipulateForecast}
              disabled={!selectedForecast}
            >
              Manipulate Forecast
            </button>
          </div>

          {/* Table for state probabilities and selections */}
          <div className="flex flex-row w-full mt-4" style={{ maxWidth: '1600px' }}>
            <div className="w-1/3 pr-4">
              <div className="mb-2">
                <p className="text-xl font-bold text-center">Scenario Probability: {scenarioProbability.toFixed(2)}%</p>
              </div>
              <Bar data={scenarioCDFData} options={scenarioCDFOptions} height={800} width={1200} />
            </div>
            <div className="w-2/3">
              <div className="w-full max-w-md mt-0">
                <h2 className="text-2xl font-bold mb-4 text-center">State Forecasts</h2>
                <table className="min-w-full border-collapse border border-gray-300 mx-auto">
                  <thead>
                    <tr>
                      <th className="border border-gray-300 px-4 py-2">State</th>
                      <th className="border border-gray-300 px-4 py-2">Correlation</th>
                      <th className="border border-gray-300 px-8 py-2">Forecasted</th>
                      <th className="border border-gray-300 px-8 py-2">Updated</th>
                      <th className="border border-gray-300 px-4 py-2">Selection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {states.map((state) => {
                      const prob = getPercentage(state.defaultAngle); // Use the defined function
                      const displayProb = prob > 50.05 ? prob.toFixed(1) : (100 - prob).toFixed(1);
                      const label = prob > 50.05 ? 'R' : prob < 49.95 ? 'D' : ''; // No label for 50.0%
                      const updatedProb = selectedStates[state.stateName] === 'R' ? 100 : selectedStates[state.stateName] === 'D' ? 0 : prob;
                      const displayUpdatedProb = updatedProb < 50 ? `${(100 - updatedProb).toFixed(1)}%` : `${updatedProb.toFixed(1)}%`;
                      const updatedLabel = updatedProb > 50.05 ? 'R' : updatedProb < 49.95 ? 'D' : ''; // No label for 50.0%

                      return (
                        <tr key={state.stateName}>
                          <td className="border border-gray-300 px-4 py-2 text-center">{state.stateName}</td>
                          <td className="border border-gray-300 px-4 py-2 text-center">{state.correlation.toFixed(2)}</td>
                          <td className="border border-gray-300 px-8 py-2 text-center">
                            <div
                              className="inline-block rounded-md"
                              style={{
                                backgroundColor: prob < 50 ? `rgba(0, 0, 255, ${1 - prob * 2 / 100})` : `rgba(255, 0, 0, ${(prob - 50) * 2 / 100})`, // Blue for prob < 50, Red for prob > 50
                                padding: '4px 8px',
                                width: 'fit-content',
                                color: prob > 30 && prob < 70 ? 'black' : 'white', // Text color is white for prob < 50, black for prob >= 50
                                whiteSpace: 'nowrap', // Force text to be on 1 line
                              }}
                            >
                              {displayProb}% {label}
                            </div>
                          </td>
                          <td className="border border-gray-300 px-8 py-2 text-center">
                            <div
                              className="inline-block rounded-md"
                              style={{
                                backgroundColor: updatedProb < 50 ? `rgba(0, 0, 255, ${1 - updatedProb * 2 / 100})` : `rgba(255, 0, 0, ${(updatedProb - 50) * 2 / 100})`, // Blue for updatedProb < 50, Red for updatedProb > 50
                                padding: '4px 8px',
                                width: 'fit-content',
                                color: updatedProb > 30 && updatedProb < 70 ? 'black' : 'white', // Text color is white for updatedProb < 50, black for updatedProb >= 50
                                whiteSpace: 'nowrap', // Force text to be on 1 line
                              }}
                            >
                              {displayUpdatedProb} {updatedLabel}
                            </div>
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-center">
                            <div className="flex space-x-2 justify-center">
                              <button
                                className={`px-4 py-2 rounded ${selectedStates[state.stateName] === 'D' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                                onClick={() => handleSelectionChange(state.stateName, 'D')}
                              >
                                D
                              </button>
                              <button
                                className={`px-4 py-2 rounded ${selectedStates[state.stateName] === 'R' ? 'bg-red-500 text-white' : 'bg-gray-200'}`}
                                onClick={() => handleSelectionChange(state.stateName, 'R')}
                              >
                                R
                              </button>
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
        </>
      ) : (
        <ForecastManipulator 
          forecasts={savedForecasts}
          selectedForecast={selectedForecast}
          setSelectedForecast={setSelectedForecast}
          onBack={() => setShowManipulator(false)}
        />
      )}
    </div>
  );
};

export default App;
