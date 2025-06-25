import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { parseISO, startOfDay, isAfter } from 'date-fns';
import { getSymbolAppearance } from '@/config/fertilitySymbols';

/** Quita ceros iniciales a día/mes */
const compactDate = (dateStr) => {
  if (!dateStr) return '';
  const [d, m] = dateStr.split('/');
  return `${parseInt(d, 10)}/${parseInt(m, 10)}`;
};

/**
 * Divide en dos líneas:
 * - full-screen: [primeros maxChars, '…']
 * - normal: si cabe en maxChars -> [todo, ''], sino parte en espacio tras maxChars
 */
const splitText = (str = '', maxChars, isFull, fallback = '–') => {
  if (!str) return [fallback, ''];
  if (str.length <= maxChars) return [str, ''];
  if (isFull) {
    return [str.slice(0, maxChars), '…'];
  }
  const idx = str.indexOf(' ', maxChars);
  if (idx === -1) {
    return [str.slice(0, maxChars), str.slice(maxChars)];
  }
  return [str.slice(0, idx), str.slice(idx + 1)];
};

const ChartPoints = ({
  data,
  getX,
  getY,
  isFullScreen,
  responsiveFontSize,
  onPointInteraction,
  clearActivePoint,
  activePoint,
  padding,
  chartHeight,
  temperatureField = 'temperature_chart',
  textRowHeight
}) => {
  const itemVariants = {
    hidden:  { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  // filas base
  const bottomY            = chartHeight - padding.bottom;
  const dateRowY           = bottomY + textRowHeight * 1;
  const cycleDayRowY       = bottomY + textRowHeight * 2;
  const symbolRowYBase     = bottomY + textRowHeight * 3;
  const mucusSensationRowY = bottomY + textRowHeight * 4.5;
  const mucusAppearanceRowY= bottomY + textRowHeight * 6;
  const observationsRowY   = bottomY + textRowHeight * 7.5;

  return (
    <>
      {/* Leyenda izquierda */}
      <motion.g variants={itemVariants}>
        {[
          { label: 'Fecha',   row: 1   },
          { label: 'Día',     row: 2   },
          { label: 'Símbolo', row: 3   },
          { label: 'Sens.',   row: 4.5 },
          { label: 'Apar.',   row: 6   },
          { label: 'Observ.', row: 7.5 },
        ].map(({ label, row }) => (
          <text
            key={label}
            x={padding.left - responsiveFontSize(1.5)}
            y={bottomY + textRowHeight * row}
            textAnchor="end"
            fontSize={responsiveFontSize(0.9)}
            fill={isFullScreen ? "#1F2937" : "#6B7280"}
          >{label}</text>
        ))}
      </motion.g>

      {data.map((point, index) => {
        const x               = getX(index);
        const y               = point[temperatureField] != null
                                ? getY(point[temperatureField])
                                : bottomY;
       const textFill        = isFullScreen ? "#1F2937" : "#6B7280";
        const hasTemp         = point[temperatureField] != null;
        const hasAnyRecord    = hasTemp
                             || point.mucus_sensation
                             || point.mucus_appearance
                             || point.fertility_symbol;
        const isPlaceholder   = String(point.id || '').startsWith('placeholder-');

const interactionProps = (!hasAnyRecord || isPlaceholder)
  ? {}
  : {
      pointerEvents: "all",
      style:         { cursor: 'pointer' },

      // Al pasar el ratón, mostramos la burbuja
      onMouseEnter: (e) => onPointInteraction(point, index, e),

      // Al hacer click/tap (desktop o móvil), también la mostramos
      onClick:      (e) => onPointInteraction(point, index, e)
    };


        // símbolo
        const symbolInfo    = getSymbolAppearance(point.fertility_symbol);
        let symbolFillStyle = 'transparent';
        if (symbolInfo?.color) {
          const raw = symbolInfo.color.replace(/^bg-/, '');
          if      (raw === 'red-500')   symbolFillStyle = '#ef4444';
          else if (raw === 'white')     symbolFillStyle = '#ffffff';
          else if (raw === 'green-500') symbolFillStyle = '#22c55e';
          else if (raw === 'pink-300')  symbolFillStyle = '#f9a8d4';
        }
        const symbolRectSize = responsiveFontSize(isFullScreen ? 1.2 : 1.5);

        const isFuture = point.isoDate
          ? isAfter(startOfDay(parseISO(point.isoDate)), startOfDay(new Date()))
          : false;


        // cuanto texto por línea
        const maxChars = isFullScreen ? 3 : 12;

        const [sensLine1, sensLine2] = splitText(
          point.mucus_sensation,
          maxChars,
          isFullScreen,
          isFuture ? '' : '–'
        );
        const [aparLine1, aparLine2] = splitText(
          point.mucus_appearance,
          maxChars,
          isFullScreen,
          isFuture ? '' : '–'
        );
        const [obsLine1, obsLine2] = splitText(
          point.observations,
          maxChars,
          isFullScreen,
          ''
        );

        return (
          <motion.g
            key={`pt-${index}-${point.isoDate || point.timestamp}`}
            variants={itemVariants}
                        {...interactionProps}
          >
            {/* punto temperatura */}
            {hasTemp && !point.ignored && (
              <circle
                cx={x} cy={y}
                r={4}
                fill="rgba(226,125,191,0.8)"
                stroke="#E27DBF"
                strokeWidth="1.5"


                /** ← Esto hace que el SVG reciba clicks/taps: **/
                pointerEvents="all"
                style={{ cursor: 'pointer' }}

                /** ← Cuando el ratón entra o hace tap, llamamos a onPointInteraction: **/
                onMouseEnter={(e) => onPointInteraction(point, index, e)}
                onTouchStart={(e) => onPointInteraction(point, index, e)}
                onClick={(e) => onPointInteraction(point, index, e)}


              />
            )}

            {/* punto ignorado */}
            {hasTemp && point.ignored && (
              <motion.g initial={{opacity:0}} animate={{opacity:1}}>
                <circle
                  cx={x} cy={y}
                  r={isFullScreen ? responsiveFontSize(0.6) : 5}
                  fill="4"
                  stroke="#64748b"
                  strokeWidth="1.5"
                />
                <X
                  x={x - 3} y={y - 3}
                  width={6} height={6}
                  className="text-slate-400"
                />
              </motion.g>
            )}

            {/* Fecha */}
            <text x={x} y={dateRowY} textAnchor="middle"
                  fontSize={responsiveFontSize()} fill={textFill}>
              {compactDate(point.date)}
            </text>

            {/* Día ciclo */}
            <text x={x} y={cycleDayRowY} textAnchor="middle"
                  fontSize={responsiveFontSize()} fill={textFill}>
              {point.cycleDay}
            </text>

            {/* Símbolo */}
            {!isPlaceholder && (
              symbolInfo.value !== 'none' ? (
                <rect
                  x={x - symbolRectSize/2}
                  y={symbolRowYBase - symbolRectSize*0.75}
                  width={symbolRectSize}
                  height={symbolRectSize}
                  fill={ symbolInfo.pattern === 'spotting-pattern'
                          ? "url(#spotting-pattern-chart)"
                          : symbolFillStyle }
                  rx={symbolRectSize * 0.2}
                />
              ) : (
                <text x={x} y={symbolRowYBase} textAnchor="middle"
                      fontSize={responsiveFontSize(0.9)} fill={textFill}>
                  –
                </text>
              )
            )}

            {/* Sensación */}
            <text x={x} y={mucusSensationRowY} textAnchor="middle"
                  fontSize={responsiveFontSize(0.9)} fill={textFill}>
              <tspan x={x} dy={0}>{sensLine1}</tspan>
              {sensLine2 && <tspan x={x} dy={responsiveFontSize(1)}>{sensLine2}</tspan>}
            </text>

            {/* Apariencia */}
            <text x={x} y={mucusAppearanceRowY} textAnchor="middle"
                  fontSize={responsiveFontSize(0.9)} fill={textFill}>
              <tspan x={x} dy={0}>{aparLine1}</tspan>
              {aparLine2 && <tspan x={x} dy={responsiveFontSize(1)}>{aparLine2}</tspan>}
            </text>
            
            {/* Observaciones */}
            <text x={x} y={observationsRowY} textAnchor="middle"
                  fontSize={responsiveFontSize(0.9)} fill={textFill}>
              <tspan x={x} dy={0}>{obsLine1}</tspan>
              {obsLine2 && <tspan x={x} dy={responsiveFontSize(1)}>{obsLine2}</tspan>}
            </text>
          </motion.g>
        );
      })}
    </>
  );
};

export default ChartPoints;
