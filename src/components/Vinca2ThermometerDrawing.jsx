import React from 'react';

// Shared original thermometer from the pairing preparation illustration.
export default function Vinca2ThermometerDrawing() {
  return <g transform="rotate(20 113 50)">

                  {/* Punta metálica */}
                  <rect
                    x="111" y="7"
                    width="4" height="14"
                    rx="1.8"
                    fill="#aeb6c2"
                  />
                  <rect
                    x="112" y="9"
                    width="1.3" height="9"
                    rx=".6"
                    fill="#edf0f4"
                  />

                  {/* Cuerpo blanco */}
                  <path
                    d="M111 19L115 19C115 36 118 44 121 56Q122 61 122 64H104Q104 61 105 56C108 44 111 36 111 19Z"
                    fill="#ffffff"
                    stroke="#d1d5db"
                    strokeWidth="1.1"
                  />

                  {/* Pantalla */}
                  <rect
                    x="109" y="44"
                    width="8" height="15"
                    rx="3"
                    fill="#e4e4e8"
                    stroke="#d1d5db"
                    strokeWidth=".6"
                  />
                  <text
                    x="113" y="53"
                    fontSize="3.5"
                    fontWeight="500"
                    textAnchor="middle"
                    fill="#64748b"
                    transform="rotate(90 113 51.5)"
                  >
                    36.42
                  </text>

                  {/* Base rosa */}
                  <path
                    d="M104 63H122V82Q122 85 119 85H107Q104 85 104 82Z"
                    fill="#df91ad"
                    stroke="#cd7495"
                    strokeWidth="1"
                  />
                  <path
                    d="M107 66V81"
                    stroke="#f6c3d5"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    opacity=".8"
                  />
                </g>;
}
