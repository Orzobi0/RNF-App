import React from 'react';

const renderStops = (stops = []) =>
  stops.map((stop) => <stop key={`${stop.offset}-${stop.color}`} offset={stop.offset} stopColor={stop.color} />);

const ChartSvgDefs = ({ ids, theme }) => (
  <defs>
    <linearGradient id={ids.bgGradientId} x1="0%" y1="0%" x2="0%" y2="100%">{renderStops(theme.bgGradient)}</linearGradient>
    <linearGradient id={ids.dataZoneGradientId} x1="0%" y1="0%" x2="0%" y2="100%">{renderStops(theme.dataZoneGradient)}</linearGradient>
    <linearGradient id={ids.tempLineGradientId} x1="0%" y1="0%" x2="100%" y2="0%">{renderStops(theme.tempLineGradient)}</linearGradient>
    <linearGradient id={ids.tempLineGlowGradientId} x1="0%" y1="0%" x2="100%" y2="0%">{renderStops(theme.tempLineGlowGradient)}</linearGradient>

    <radialGradient id={ids.tempPointGradientId} cx="30%" cy="30%">{renderStops(theme.tempPointRadialGradient)}</radialGradient>
    <radialGradient id={ids.tempPointIgnoredGradientId} cx="30%" cy="30%">{renderStops(theme.tempPointIgnoredGradient)}</radialGradient>
    <radialGradient id={ids.ovulationPointGradientId} cx="30%" cy="30%">{renderStops(theme.ovulationPointGradient)}</radialGradient>

    <filter id={ids.textShadowFilterId} x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="rgba(255, 255, 255, 0.8)" />
    </filter>
    <filter id={ids.softShadowFilterId}>
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
      <feOffset dx="0" dy="1" result="offsetblur" />
      <feComponentTransfer><feFuncA type="linear" slope="0.2" /></feComponentTransfer>
      <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <filter id={ids.lineShadowFilterId} x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(244, 114, 182, 0.4)" />
    </filter>
    <filter id={ids.lineGlowFilterId} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="coloredBlur" />
      <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <filter id={ids.pointGlowFilterId} x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
      <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>

    <pattern id={ids.spottingPatternId} patternUnits="userSpaceOnUse" width="6" height="6">
      <rect width="6" height="6" fill="#fb7185" />
      <circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,0.85)" />
    </pattern>
  </defs>
);

export default ChartSvgDefs;
