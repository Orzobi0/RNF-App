import React from 'react';
import { motion } from 'framer-motion';

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

  return (
    <svg
      width={padding.left}
      height={chartHeight}
      className="font-sans pointer-events-none"
    >
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
            fill="#6B7280"
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
        fill="#6B7280"
      >
        °C
      </motion.text>

      <motion.g variants={itemVariants}>
        {[
          { label: 'Fecha', row: 1 },
          { label: 'Día', row: 2 },
          { label: 'Símbolo', row: 3 },
          { label: 'Sens.', row: 4.5 },
          { label: 'Apar.', row: 6 },
          { label: 'Observ.', row: 7.5 }
        ].map(({ label, row }) => (
          <text
            key={label}
            x={padding.left - responsiveFontSize(1.5)}
            y={bottomY + textRowHeight * row}
            textAnchor="end"
            fontSize={responsiveFontSize(0.9)}
            fill={isFullScreen ? '#1F2937' : '#6B7280'}
          >
            {label}
          </text>
        ))}
      </motion.g>
    </svg>
  );
};

export default ChartLeftLegend;