import React, { useEffect, useMemo, useRef } from 'react';

const ChartRightStickyTempLegend = ({
  chartRef,
  padding,
  tempMin,
  tempMax,
  tempRange,
  getY,
  responsiveFontSize,
  ...restProps
}) => {
  const railRef = useRef(null);

  const ticks = useMemo(() => {
    const values = [];
    const tickIncrement = tempRange > 0 && tempRange <= 2.5 ? 0.1 : 0.5;
    const from = tempRange > 0 ? tempMin : 35.8;
    const to = tempRange > 0 ? tempMax : 37.2;

    for (let tick = from; tick <= to + 1e-9; tick += tickIncrement) {
      values.push(Number(tick.toFixed(1)));
    }

    return values;
  }, [tempMax, tempMin, tempRange]);

  const legendHeight = useMemo(() => {
    if (!ticks.length) return 0;
    return Math.max(...ticks.map((temp) => getY(temp))) + responsiveFontSize(2);
  }, [ticks, getY, responsiveFontSize]);

  useEffect(() => {
    const scroller = chartRef?.current;
    if (!scroller) return undefined;

    let rafId = 0;

    const syncTransform = () => {
      if (rafId) return;

      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        if (!railRef.current) return;
        railRef.current.style.transform = `translate3d(0, ${-(scroller.scrollTop || 0)}px, 0)`;
      });
    };

    syncTransform();

    scroller.addEventListener('scroll', syncTransform, { passive: true });
    window.addEventListener('resize', syncTransform);
    window.addEventListener('orientationchange', syncTransform);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(syncTransform)
        : null;

    resizeObserver?.observe(scroller);

    return () => {
      scroller.removeEventListener('scroll', syncTransform);
      window.removeEventListener('resize', syncTransform);
      window.removeEventListener('orientationchange', syncTransform);
      resizeObserver?.disconnect();
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [chartRef]);

  return (
    <div
      className="absolute inset-0 pointer-events-none z-30 overflow-hidden"
      aria-hidden="true"
      {...restProps}
    >
      <svg
        ref={railRef}
        width={padding.right}
        height={legendHeight}
        className="absolute right-0 top-0"
        style={{
          willChange: 'transform',
          transform: 'translate3d(0, 0, 0)',
        }}
      >
        <defs>
          <filter id="textShadowLegendRight" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="rgba(255, 255, 255, 0.9)" />
          </filter>
        </defs>

        {ticks.map((temp) => {
          const rawY = getY(temp);
          if (!Number.isFinite(rawY)) return null;

          const isMajor = temp.toFixed(1).endsWith('.0') || temp.toFixed(1).endsWith('.5');
          const labelText = isMajor ? temp.toFixed(1) : `.${temp.toFixed(1).split('.')[1]}`;

          return (
            <text
              key={`sticky-temp-${temp}`}
              x={padding.right - responsiveFontSize(1.2)}
              y={rawY + responsiveFontSize(0.35)}
              textAnchor="end"
              fontSize={responsiveFontSize(isMajor ? 1.15 : 1)}
              fontWeight={isMajor ? '800' : '700'}
              fill={isMajor ? '#be185d' : '#db2777'}
              opacity={isMajor ? 1 : 0.85}
              style={{
                filter: 'url(#textShadowLegendRight)',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              {labelText}
            </text>
          );
        })}
      </svg>
    </div>
  );
};

export default ChartRightStickyTempLegend;