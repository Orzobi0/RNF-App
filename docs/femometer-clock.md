# Reloj y contrato mínimo BLE — Android Staging

## Fundamento técnico (30-10-2026)

- [Bluetooth SIG: Current Time Service](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/CTS_v1.0/out/en/index-en.html): servicio estándar de hora local; lectura requerida, escritura opcional. El servidor puede rechazar campos ignorados con error ATT 0x80. La escritura no implica por sí sola que el reloj haya quedado ajustado.
- [Bluetooth SIG: números asignados](https://www.bluetooth.com/wp-content/uploads/Files/Specification/Assigned_Numbers.pdf): Current Time Service `0x1805`, Current Time `0x2A2B`, Date Time `0x2A08`, Measurement Interval `0x2A21`. Este último no ajusta fecha/hora.
- [Nordic: estructura Current Time](https://docs.nordicsemi.com/r/bundle/nrf5_sdk_v10.0.0/page/group_ble_sdk_srv_cts_c.html): Date Time, día de semana, fracciones de segundo y motivo del ajuste.
- [Gadgetbridge: Vinca 2](https://gadgetbridge.org/gadgets/thermometers/femometer/): documenta ajuste de hora y modos.
- [Referencia del adaptador Vinca 2](https://github.com/Freeyourgadget/Gadgetbridge/blob/master/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/service/devices/femometer/FemometerVinca2DeviceSupport.java), consultada mediante la API pública de GitHub, blob `8f50da02fe5725bbe28855b31c2f0949bc7761c1`: confirma que este modelo usa Current Time para el ajuste, separadamente del intervalo de medición. No hizo falta deducir ni probar comandos propietarios de reloj.

Se consultó esa referencia para identificar el protocolo, sin copiar implementación, helpers, inicialización ni comandos de configuración de Gadgetbridge. No se incorpora su software AGPL ni ninguna dependencia nueva. La codificación y la transacción son implementaciones originales del formato estándar. No se afirma validación física de esta implementación.

## Operación y formato

El panel ofrece **Leer reloj** y **Sincronizar fecha y hora** mientras la escucha está preparada. Los botones dependen de READ/WRITE anunciados por `0x2A2B` dentro de `0x1805`; no se escribe por el mero hecho de encontrar otro UUID de fecha. No hay sincronización al conectar.

Se escribe un valor de 10 octetos: año uint16 little-endian; mes, día, hora, minuto y segundo; día de semana (lunes=1); fracción en unidades de 1/256 s; motivo de ajuste manual (bit 0). No hay prefijo propietario. `0x2A21` conserva exclusivamente su función anterior.

El calendario gregoriano del teléfono proporciona los componentes locales con su zona y DST vigentes. No se envía una época UTC ni se suma el offset dos veces. No se modifica Local Time Information `0x2A0F`: este ajuste establece la hora local, no configura una zona horaria permanente en el termómetro. Se devuelven por separado la zona IANA y el offset del teléfono; la zona del dispositivo sigue siendo desconocida.

Tras confirmación de escritura GATT se lee el reloj si READ está disponible. La verificación compara sus componentes con el teléfono al recibir la respuesta, tolerancia de 5 segundos, y exige que la zona y offset del teléfono no hayan cambiado durante la operación. Sin lectura, con discrepancia o cambio de zona, no se presenta como verificado. Fecha desconocida, inválida o respuesta fallida producen un error específico. Una fecha devuelta en un hueco DST se conserva como componentes; no se transforma arbitrariamente en otro instante.

Una única operación de reloj utiliza la conexión de escucha existente, después de finalizar su preparación. Los errores de reloj no desconectan ni invalidan la suscripción de temperaturas. Cancelar/salir/cambiar de cuenta cancela la llamada y descarta continuaciones tardías. Un timeout de 8 s bloquea nuevas operaciones de reloj sobre ese GATT hasta reconectar, para no confundir callbacks tardíos con un intento nuevo. La recepción de temperaturas continúa. Cancelar una escritura ya enviada no revierte el reloj; después de un timeout su efecto puede ser desconocido.

## Separación mínima

- `FemometerBle`: transporte, escaneo, conexión, eventos y asociación de la fase 1.
- `Vinca2Profile`: constantes específicas y capacidades anunciadas del modelo actual. No es un framework ni agrega otros modelos.
- `BleClockCodec` y `BleClockOperation`: formato estándar y una operación CTS opcional sobre el transporte existente.
- `thermometerCapabilities`: contrato pequeño de operaciones disponibles en FertiliApp: `model`, `clockProtocol`, `clockRead`, `clockSync`, `historyReceive`, `historyRequest`, `modeConfiguration`. Un modelo desconocido no hereda capacidades. Los dos últimos son falsos porque no están implementados, no porque el hardware sea necesariamente incapaz. `historyReceive` describe las indicaciones almacenadas observadas por el usuario, sin identificar cuáles son antiguas ni pedir/borrar historial.
- `normalizeBleMeasurement`: función independiente de modelo y sin efectos secundarios. Devuelve el formato común de temperatura/hora/origen, más `device_timestamp`, `received_at`, `device_date_reliability` y `device_timezone`. No escribe en ciclos ni llama a `temperatureMeasurements.js` para seleccionar o guardar entradas.

La fecha nativa de una medición ya no recibe artificialmente el offset del móvil: el paquete Date Time no incluye zona. Se validan límites y calendario sin rollover; la fecha original de 2020 sigue siendo de 2020 y permanece **sin verificar**. Ni siquiera un ajuste verificado hace fiables las mediciones posteriores recibidas, porque podrían ser historial anterior al ajuste. Las fechas inválidas se señalan como tales y los bytes originales siguen disponibles en el diagnóstico existente. Fecha de recepción y fecha del dispositivo nunca se sustituyen entre sí.

## Validación física preparada

1. Instalar un APK de Staging con estos cambios y cargar esta versión del frontend. El Hosting remoto existente no se actualiza mediante `cap sync`; esta tarea no despliega.
2. Abrir Ajustes, esperar la escucha y pulsar **Leer reloj**. Anotar la lectura previa, la hora/zona del móvil y las propiedades READ/WRITE. Si faltan, no enviar escrituras alternativas.
3. Pulsar **Sincronizar fecha y hora** una vez. Exigir confirmación de escritura y lectura posterior dentro de 5 segundos; después pulsar **Leer reloj** otra vez. Si no se verifica, conservar el resultado y no asumir éxito.
4. Medir después del ajuste y comprobar la fecha indicada sin guardar la medición. Separar estas nuevas mediciones de las antiguas de 2020. No inferir un desplazamiento para corregir historial.
5. Apagar/encender el termómetro, reconectar y leer de nuevo para comprobar persistencia del reloj. No ajustar automáticamente al reconectar.
6. Probar detener/salir durante consulta y ajuste, reabrir rápidamente y cambiar de cuenta. No debe haber conexiones ni suscripciones duplicadas. Un ajuste ya transmitido puede haberse aplicado aunque se cancele.
7. Forzar desconexión o fallo del reloj; comprobar que los errores opcionales de reloj no cierran por sí solos la escucha. Si la conexión física se pierde, aplica el manejo de desconexión existente.
8. Si se prueba otra zona del móvil, volver a ajustar explícitamente y comparar componentes locales. No se garantiza que el termómetro cambie automáticamente de zona o DST.

Riesgos pendientes: diferencias de firmware, rechazo de campos del formato CTS, persistencia del reloj tras apagado y efecto del ajuste sobre el historial del propio dispositivo. No se ha comprobado físicamente ninguno en esta fase. La implementación no depende de Femometer Connect, no toca Firebase y no modifica permisos ni empaquetado.

## Archivos y resultados

Modificados: `FemometerBle.java`, `src/lib/femometerBle.js`, `src/lib/femometerSession.js`, `src/pages/SettingsPage.jsx`, `scripts/android-ui.test.mjs`.

Añadidos: `BleClockCodec.java`, `BleClockOperation.java`, `Vinca2Profile.java` (en el paquete nativo existente), `android/app/src/test/java/com/fertiliapp/fertiliapp/BleClockCodecTest.java`, `src/lib/thermometerCapabilities.js`, `src/lib/bleMeasurements.js`, `scripts/ble-measurements.test.mjs` y este documento. `src/lib/temperatureMeasurements.js` se revisó y no se modificó.

Validación ejecutada:

- `npm run check:staging`: correcto.
- `node --test scripts/ble-measurements.test.mjs scripts/femometer-bridge.test.mjs scripts/android-ui.test.mjs scripts/temperature-measurements.test.mjs`: 36 pruebas correctas. Aviso no fatal de puerto WebSocket 24678 ocupado.
- `npm run build:staging` y `npm run sync:staging:android`: correctos.
- `CAPACITOR_ENV=staging`, JDK de Android Studio2, `gradlew.bat :app:testDebugUnitTest assembleDebug`: BUILD SUCCESSFUL. Las 4 pruebas nuevas de `BleClockCodecTest` pasan; cubren formato, calendario, límites, zonas, DST y verificación.
- `git diff --check`: correcto.

No se ha instalado el APK ni sincronizado físicamente el reloj. No se ha desplegado ni creado commit. Las pruebas del controlador simulan el transporte y no certifican el comportamiento GATT del firmware real.
