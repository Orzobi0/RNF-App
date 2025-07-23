// Description: This component renders the axes and ticks for a temperature chart.
import React from 'react';
import { motion } from 'framer-motion';

const ChartAxes = ({
  padding,
  chartWidth,
  chartHeight,
  tempMin,
  tempMax,
  tempRange,
  getY,
  getX,
  allDataPoints = [],
  responsiveFontSize,
  isFullScreen
}) => {
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  // build ticks every 0.1° up to 2.5° range, else every 0.5°
  const tempTicks = [];
  if (tempRange > 0) {
    const tickIncrement = tempRange <= 2.5 ? 0.1 : 0.5;
    for (let t = tempMin; t <= tempMax + 1e-9; t += tickIncrement) {
      tempTicks.push(parseFloat(t.toFixed(1)));
    }
  } else {
    for (let t = 35.0; t <= 37.5 + 1e-9; t += 0.5) {
      tempTicks.push(parseFloat(t.toFixed(1)));
    }
  }

  return (
    <>
      {tempTicks.map((temp, i) => {
        const y = getY(temp);
        const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
        // label: full number on majors, only decimal on minors
        const labelText = isMajor
          ? temp.toFixed(1)
          : `.${temp.toFixed(1).split('.')[1]}`;

        return (
          <motion.g key={`temp-tick-${i}`} variants={itemVariants}>
            {/* grid line */}
            <line
              x1={padding.left}
              y1={y}
              x2={chartWidth - padding.right}
              y2={y}
              stroke="#E5E7EB"
              strokeWidth={isMajor ? 1 : 0.5}
              strokeDasharray={isMajor ? '0' : '2,2'}
            />

            {/* left label */}
            <text
              x={padding.left - responsiveFontSize(0.8)}
              y={y + responsiveFontSize(0.3)}
              textAnchor="end"
              fontSize={responsiveFontSize()}
              fill="#9CA3AF"
            >
              {labelText}
            </text>

            {/* right label */}
            <text
              x={chartWidth - padding.right + responsiveFontSize(0.8)}
              y={y + responsiveFontSize(0.3)}
              textAnchor="start"
              fontSize={responsiveFontSize()}
              fill="#9CA3AF"
            >
              {labelText}
            </text>
        </motion.g>
        );
      })}

      {allDataPoints.map((_, i) => {
        const x = getX(i);
        return (
          <line
            key={`day-grid-${i}`}
            x1={x}
            y1={padding.top}
            x2={x}
            y2={chartHeight - padding.bottom}
            stroke="#E5E7EB"
            strokeWidth={0.5}
          />
        );
      })}

      {/* °C unit in top-left corner */}
      <motion.text
        variants={itemVariants}
        x={padding.left + responsiveFontSize(0.5)}
        y={padding.top + responsiveFontSize(1)}
        textAnchor="start"
        fontSize={responsiveFontSize(1.2)}
        fill="#6B7280"
      >
        °C
      </motion.text>
    </>
  );
};

export default ChartAxes;
