import React from 'react';
    import { motion } from 'framer-motion';

    const ChartLine = ({ data, allDataPoints, getX, getY, temperatureField = 'temperature' }) => {
      if (!data || data.length < 2) return null;

      let pathD = "M";
      let firstPointIndex = -1;

      allDataPoints.forEach((point, index) => {
        const dataPoint = data.find(dp => dp.id === point.id);
        if (dataPoint && dataPoint[temperatureField] !== null && dataPoint[temperatureField] !== undefined && !dataPoint.ignored) {
          const x = getX(index);
          const y = getY(dataPoint[temperatureField]);
          if (firstPointIndex === -1) {
            pathD += `${x} ${y}`;
            firstPointIndex = index;
          } else {
            pathD += ` L ${x} ${y}`;
          }
        } else if (firstPointIndex !== -1 && point[temperatureField] === null && !point.ignored) {
           pathD += ` M`; 
           firstPointIndex = -1;
        } else if (firstPointIndex !== -1 && point.ignored) {
           pathD += ` M`;
           firstPointIndex = -1;
        }
      });
      
      if (pathD === "M" || pathD.endsWith(" M")) return null;

      return (
        <motion.path
          d={pathD}
          fill="none"
          stroke="url(#tempLineGradientChart)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeInOut" }}
        />
      );
    };

    export default ChartLine;