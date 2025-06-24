import React from 'react';
    import { motion } from 'framer-motion';

const ChartLine = ({ data, allDataPoints, getX, getY, baselineY, temperatureField = 'temperature' }) => {
  if (!data || data.length < 2) return null;

  let pathD = '';
  let lastValidIndex = null;
  let firstX = null;
  let lastX = null;

  allDataPoints.forEach((point, index) => {
    const dataPoint = data.find(dp => dp.id === point.id);
    if (dataPoint && dataPoint[temperatureField] !== null && dataPoint[temperatureField] !== undefined && !dataPoint.ignored) {
      const x = getX(index);
      const y = getY(dataPoint[temperatureField]);
            if (firstX === null) firstX = x;
      lastX = x;
      if (lastValidIndex !== null && index === lastValidIndex + 1) {
        pathD += ` L ${x} ${y}`;
      } else {
        pathD += `${pathD ? ' ' : ''}M ${x} ${y}`;
      }
      lastValidIndex = index;
    }
  });
      
      if (!pathD.includes("L")) return null;
  const areaPath = `${pathD} L ${lastX} ${baselineY} L ${firstX} ${baselineY} Z`;
  
      return (
                <>
        <motion.path
          d={areaPath}
          fill="url(#tempAreaGradientChart)"
          stroke="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
        <motion.path
          d={pathD}
          fill="none"
          stroke="url(#tempLineGradientChart)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
        />
                </>
      );
    };

export default ChartLine;