# Easy@Home EBT-300: adaptador experimental

Fuente: [easyathome-ble 0.2.4](https://github.com/chmielowiec/easyathome-ble/tree/d6361b2500794f057ade5f693487eebf95c28c32), commit `d6361b2500794f057ade5f693487eebf95c28c32`. Consultados `src/easyathome_ble/device.py`, `parser.py`, `tests/conftest.py`, `test_parser.py`, `test_device.py` y LICENSE.

La fixture identifica `EBT-300` y FFE0. Se exige nombre exacto (o modelo DIS exacto, que prevalece sobre el nombre), FFE0, FFE1 escribible y FFE2 con notificación y CCCD. Los UUID solos, Easy@Home sin modelo, EBT-089 y otros modelos no autorizan el adaptador.

El parser documenta paquetes de 15 bytes: tipo 1 actual/17 histórico, temperatura unsigned little-endian en bytes 4–5 dividida por 100, año little-endian en 8–9 más 1970, mes/día/hora/minuto/segundo en 10–14. No documenta un flag de unidad ni un identificador único de medición. Los campos desconocidos no se interpretan. Se rechazan longitudes distintas, tipos desconocidos y fechas inválidas.

La preparación reproduce la secuencia documentada: reloj local `[90,3,6,año-1970,mes,día,hora,minuto,segundo]`, Celsius `[90,6,6,1,255,255,255,255,250]` y suscripción FFE2. Cada paso espera el callback de escritura anterior. El año del comando admite 1970–2225. Las operaciones manuales comparten la exclusión GATT con información y configuración; timeout exige reconectar. Se conserva la preferencia por escritura sin respuesta cuando se anuncia. No hay lectura documentada del reloj: la interfaz indica enviado, nunca verificado.

El selector manual envía el mismo comando de unidad con 1 (C) o 2 (F). Una escritura aceptada no demuestra la unidad transmitida. Por ello, cualquier cambio manual pausa la interpretación en esa conexión; la siguiente escucha vuelve a prepararse en Celsius, conservando la preferencia solicitada por separado. Fahrenheit no se interpreta ni aplica automáticamente al reconectar hasta su comprobación física. Los históricos de unidad incierta se rechazan con aviso y nunca llegan a pendientes. No se infiere unidad por magnitud.

El [manual del fabricante EBT-300](https://manuals.plus/m/1110451ad72112cfedafcfc5456a280906c90f0f6929ab36f08f04251da4c1d0.pdf), apartado 8, establece 89,6–109,4 °F: se limita la recepción Celsius a 32–43 °C. Siguen pendientes la verificación física de la secuencia, los callbacks sin respuesta y la unidad de transmisión/históricos. El adaptador continúa experimental; no incorpora volumen, modo, lectura de reloj ni solicitud de historial.

El código del perfil y sus fixtures se han adaptado bajo MIT. Atribución y licencia: [easyathome-ble.LICENSE](../licenses/easyathome-ble.LICENSE).

