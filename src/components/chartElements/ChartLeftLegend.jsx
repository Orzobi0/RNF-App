import React from 'react';
import { motion } from 'framer-motion';

const SENSATION_COLOR = '#0284c7';
const APPEARANCE_COLOR = '#059669';
const OBSERVATION_COLOR = '#7e22ce';

const ChartLeftLegend = ({
  padding,
  chartHeight,
  tempMin,
  tempMax,
  tempRange,
  getY,
  responsiveFontSize,
  textRowHeight,
  isFullScreen
}) => {
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

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

  const bottomY = chartHeight - padding.bottom;
  const rowBlockHeight = textRowHeight * (isFullScreen ? 2 : 1.5);

  return (
    <svg
      width={padding.left}
      height={chartHeight}
      className="font-sans pointer-events-none"
    >
            {/* white background for row labels */}
      <rect
        x={0}
        y={bottomY + textRowHeight * 0.5}
        width={padding.left}
        height={textRowHeight * (isFullScreen ? 9.5 : 8)}
        fill="white"
      />
      {tempTicks.map((temp, i) => {
        const y = getY(temp);
        const isMajor =
          temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
        const labelText = isMajor
          ? temp.toFixed(1)
          : `.${temp.toFixed(1).split('.')[1]}`;
        return (
          <motion.text
            key={`temp-tick-fixed-${i}`}
            variants={itemVariants}
            x={padding.left - responsiveFontSize(0.8)}
            y={y + responsiveFontSize(0.3)}
            textAnchor="end"
            fontSize={responsiveFontSize()}
            fill="#E27DBF"
          >
            {labelText}
          </motion.text>
        );
      })}

      <motion.text
        variants={itemVariants}
        x={padding.left + responsiveFontSize(0.5)}
        y={padding.top + responsiveFontSize(1)}
        textAnchor="start"
        fontSize={responsiveFontSize(1.2)}
        fill="#E27DBF"
      >
        °C
      </motion.text>

      <motion.g variants={itemVariants}>
        {[
          { label: 'Fecha', row: 1, color: isFullScreen ? '#1F2937' : '#E27DBF' },
          { label: 'Día', row: 2, color: isFullScreen ? '#1F2937' : '#E27DBF' },
          { label: 'Símbolo', row: 3, color: isFullScreen ? '#1F2937' : '#E27DBF' },
          { label: 'Sens.', row: isFullScreen ? 5 : 4.5, color: SENSATION_COLOR },
          { label: 'Apar.', row: isFullScreen ? 7 : 6, color: APPEARANCE_COLOR },
          { label: 'Observ.', row: isFullScreen ? 9 : 7.5, color: OBSERVATION_COLOR }
        ].map(({ label, row, color }) => (
          <text
            key={label}
            x={padding.left - responsiveFontSize(1.5)}
            y={bottomY + textRowHeight * row}
            textAnchor="end"
            fontSize={responsiveFontSize(0.9)}
            fill={color}
          >
            {label}
          </text>
        ))}
      </motion.g>
    </svg>
  );
};

export default ChartLeftLegend;