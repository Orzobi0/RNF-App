import React from 'react';
    import { motion } from 'framer-motion';
    import { X } from 'lucide-react';
    import { getSymbolAppearance } from '@/config/fertilitySymbols';

    const ChartPoints = ({ data, getX, getY, isFullScreen, responsiveFontSize, onPointInteraction, activePoint, padding, chartHeight, temperatureField = 'temperature_chart', textRowHeight }) => {
      const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
      };
      
      const textMaxWidth = isFullScreen ? 70 : 50; 

      return (
        <>
          {data.map((point, index) => {
            const x = getX(index);
            const y = point[temperatureField] !== null && point[temperatureField] !== undefined ? getY(point[temperatureField]) : (chartHeight - padding.bottom);
            
            const textFill = isFullScreen ? "#cbd5e1" : "#94a3b8";
            const hasTempRecord = point[temperatureField] !== null && point[temperatureField] !== undefined;
            const hasAnyRecord = hasTempRecord || point.mucus_sensation || point.mucus_appearance || point.fertility_symbol;
            const isPlaceholder = point.id && String(point.id).startsWith('placeholder-');
            
            const interactionProps = isPlaceholder || !hasAnyRecord ? {} : {
              onMouseEnter: (e) => onPointInteraction(point, index, e),
              onTouchStart: (e) => onPointInteraction(point, index, e),
              style: { cursor: hasAnyRecord ? 'pointer' : 'default' }
            };

// nuevo: alineado debajo del chartHeight
const bottomY            = chartHeight - padding.bottom;
const dateRowY           = bottomY + textRowHeight * 1;
const cycleDayRowY       = bottomY + textRowHeight * 2;
const symbolRowYBase     = bottomY + textRowHeight * 3;
const mucusSensationRowY = bottomY + textRowHeight * 4;
const mucusAppearanceRowY= bottomY + textRowHeight * 5;


            const symbolInfo = getSymbolAppearance(point.fertility_symbol);
            let symbolFillStyle = 'transparent';
            if (symbolInfo && symbolInfo.color) {
                symbolFillStyle = symbolInfo.color.startsWith('bg-') ? symbolInfo.color.replace('bg-', '') : symbolInfo.color;
                if (symbolFillStyle === 'red-500') symbolFillStyle = '#ef4444';
                else if (symbolFillStyle === 'white') symbolFillStyle = '#ffffff';
                else if (symbolFillStyle === 'green-500') symbolFillStyle = '#22c55e';
                else if (symbolFillStyle === 'pink-300') symbolFillStyle = '#f9a8d4'; // For 'spot' or others if needed
            }
            
            const symbolRectSize = responsiveFontSize(isFullScreen ? 1.2 : 1.5);


            return (
              <motion.g 
                key={`point-${index}-${point.isoDate || point.timestamp}`} 
                variants={itemVariants}
                {...interactionProps}
              >
                {hasTempRecord && !point.ignored && (
                      <circle
                        cx={x}
                        cy={y}
                        r={isFullScreen ? responsiveFontSize(0.6) : 5}
                        fill={
                          point.use_corrected
                            ? (activePoint && activePoint.id === point.id
                                ? "rgba(238, 233, 219, 0.8)"   // color gris tenue si está activo
                                : "rgba(194, 186, 164, 0.4)"   // color gris muy suave si no
                              )
                            : (activePoint && activePoint.id === point.id
                                ? "rgba(255,255,255,0.8)"
                                : "white"
                              )
                        }
                        stroke="url(#tempLineGradientChart)"
                        strokeWidth="2"
                      />
                    )}
                 {hasTempRecord && point.ignored && (
                   <motion.g initial={{opacity:0}} animate={{opacity:1}}>
                    <circle
                        cx={x}
                        cy={y}
                        r={isFullScreen ? responsiveFontSize(0.6) : 5}
                        fill="rgba(100, 116, 139, 0.5)"
                        stroke="#64748b"
                        strokeWidth="1.5"
                    />
                    <X 
                        x={x - (isFullScreen ? responsiveFontSize(0.35) : 3)} 
                        y={y - (isFullScreen ? responsiveFontSize(0.35) : 3)}
                        height={isFullScreen ? responsiveFontSize(0.7) : 6} 
                        width={isFullScreen ? responsiveFontSize(0.7) : 6} 
                        className="text-slate-400"
                    />
                   </motion.g>
                )}
                
                <text x={x} y={dateRowY} textAnchor="middle" fontSize={responsiveFontSize()} fill={textFill}>
                  {point.date || 'N/A'}
                </text>
                
                <text x={x} y={cycleDayRowY} textAnchor="middle" fontSize={responsiveFontSize()} fill={textFill}>
                  CD {point.cycle_day || 'N/A'}
                </text>
                
                {(hasAnyRecord || isPlaceholder) && !isPlaceholder && (
                  <>
                  {point.fertility_symbol && symbolInfo && symbolInfo.value !== 'none' ? (
                    symbolInfo.pattern === 'spotting-pattern' ? (
                      <rect
                        x={x - symbolRectSize / 2}
                        y={symbolRowYBase - symbolRectSize * 0.75} 
                        width={symbolRectSize}
                        height={symbolRectSize}
                        fill="url(#spotting-pattern-chart)"
                        rx={symbolRectSize * 0.2}
                      />
                    ) : (
                      <rect
                        x={x - symbolRectSize / 2}
                        y={symbolRowYBase - symbolRectSize * 0.75} 
                        width={symbolRectSize}
                        height={symbolRectSize}
                        fill={symbolFillStyle}
                        rx={symbolRectSize * 0.2}
                      />
                    )
                  ) : (
                     <text x={x} y={symbolRowYBase} textAnchor="middle" fontSize={responsiveFontSize(0.9)} fill={textFill}>-</text>
                  )}

                  <text x={x} y={mucusSensationRowY} textAnchor="middle" fontSize={responsiveFontSize(0.9)} fill={textFill} style={{maxWidth: `${textMaxWidth}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                    {point.mucus_sensation || '-'}
                  </text>
                  <text x={x} y={mucusAppearanceRowY} textAnchor="middle" fontSize={responsiveFontSize(0.9)} fill={textFill} style={{maxWidth: `${textMaxWidth}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                    {point.mucus_appearance || '-'}
                  </text>
                  </>
                )}
              </motion.g>
            );
          })}
        </>
      );
    };

    export default ChartPoints;