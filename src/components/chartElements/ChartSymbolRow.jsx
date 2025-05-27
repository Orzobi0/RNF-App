import React from 'react';
    import { motion } from 'framer-motion';
    import { getSymbolAppearance } from '@/config/fertilitySymbols';

    const ChartSymbolRow = ({ data, getX, chartHeight, padding, symbolRowHeight, responsiveFontSize, isFullScreen, textRowHeight }) => {
      const itemVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1 }
      };
      
      const symbolYPosition = chartHeight - padding.bottom + textRowHeight * 2 + textRowHeight * 0.5; // Adjusted y position
      const symbolSize = responsiveFontSize(isFullScreen ? 1.2 : 1.5);

      return (
        <g>
          {data.map((point, index) => {
            if (!point.fertility_symbol || point.fertility_symbol === 'none') return null;

            const x = getX(index);
            const symbolInfo = getSymbolAppearance(point.fertility_symbol);
            
            let fillStyle = 'transparent';
             if (symbolInfo && symbolInfo.color) {
                fillStyle = symbolInfo.color.startsWith('bg-') ? symbolInfo.color.replace('bg-', '') : symbolInfo.color;
                if (fillStyle === 'red-500') fillStyle = '#ef4444';
                else if (fillStyle === 'white') fillStyle = '#ffffff';
                else if (fillStyle === 'green-500') fillStyle = '#22c55e';
                else if (fillStyle === 'pink-300') fillStyle = '#f9a8d4'; // For 'spot' or others if needed
            }


            return (
              <motion.g key={`symbol-row-${index}-${point.isoDate || point.timestamp}`} variants={itemVariants}>
                {symbolInfo.pattern === 'spotting-pattern' ? (
                  <rect
                    x={x - symbolSize / 2}
                    y={symbolYPosition - symbolSize / 2} 
                    width={symbolSize}
                    height={symbolSize}
                    fill="url(#spotting-pattern-chart)"
                    rx={symbolSize * 0.2}
                  />
                ) : (
                  <rect
                    x={x - symbolSize / 2}
                    y={symbolYPosition - symbolSize / 2} 
                    width={symbolSize}
                    height={symbolSize}
                    fill={fillStyle}
                    rx={symbolSize * 0.2} 
                  />
                )}
              </motion.g>
            );
          })}
        </g>
      );
    };

    export default ChartSymbolRow;