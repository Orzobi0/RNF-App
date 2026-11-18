# Easy@Home EBT-300: adaptador experimental

Fuente: [easyathome-ble 0.2.4](https://github.com/chmielowiec/easyathome-ble/tree/d6361b2500794f057ade5f693487eebf95c28c32), commit `d6361b2500794f057ade5f693487eebf95c28c32`. Consultados `src/easyathome_ble/device.py`, `parser.py`, `tests/conftest.py`, `test_parser.py`, `test_device.py` y LICENSE.

La fixture identifica `EBT-300` y FFE0. Se exige nombre exacto (o modelo DIS exacto, que prevalece sobre el nombre), FFE0, FFE1 escribible y FFE2 con notificación y CCCD. Los UUID solos, Easy@Home sin modelo, EBT-089 y otros modelos no autorizan el adaptador.

El parser documenta paquetes de 15 bytes: tipo 1 actual/17 histórico, temperatura unsigned little-endian en bytes 4–5 dividida por 100, año little-endian en 8–9 más 1970, mes/día/hora/minuto/segundo en 10–14. No documenta un flag de unidad ni un identificador único de medición. Los campos desconocidos no se interpretan. Se rechazan longitudes distintas, tipos desconocidos y fechas inválidas.

La biblioteca configura hora y Celsius antes de suscribirse. FertiliApp omite deliberadamente la sincronización de hora y envía únicamente el comando de unidad documentado `5A 06 06 01 FF FF FF FF FA`; no deduce la unidad por el valor. Prefiere escritura sin respuesta cuando se anuncia, igual que la fuente, y espera la finalización de escritura de Android antes de activar notificaciones. No prueba modos de escritura no anunciados ni reintenta comandos fallidos. La aceptación de escritura no verifica físicamente que el firmware haya aplicado la unidad.

La secuencia sin ajuste de reloj, la unidad de lecturas históricas y la recepción real requieren validación física. Hasta entonces el adaptador se presenta como Experimental. No se afirma compatibilidad hardware probada. El catálogo en código no convierte una comprobación individual en soporte global de todos los dispositivos del mismo nombre.

El código del perfil y sus fixtures se han adaptado bajo MIT. Atribución y licencia: [easyathome-ble.LICENSE](../licenses/easyathome-ble.LICENSE).

## Archivos y separación para revisión

- **A — Vinculación estándar y recepción común:** `android/app/src/main/java/com/fertiliapp/fertiliapp/{FemometerBle,FemometerIdentityStore,ThermometerVerification}.java`; `src/lib/{femometerBle,femometerSession,thermometerCapabilities,thermometerCatalog,bleMeasurements,temperatureMeasurements}.js`; `src/contexts/FemometerContext.jsx`; `src/pages/DevicesPage.jsx`; `src/components/{ThermometerVerificationView,Vinca2Panel,BleReadingReview}.jsx`.
- **B — EBT-300:** nuevo `android/app/src/main/java/com/fertiliapp/fertiliapp/EasyHomeProfile.java`; reconocimiento en `ThermometerDiscovery.java`, entrada en `thermometerCatalog.js` y ramas explícitas `easyhome-ebt300` en `FemometerBle.java`. El resto de la vinculación utiliza el bloque común. Documentación y atribución en este archivo y `licenses/easyathome-ble.LICENSE`.
- **Laboratorio:** `src/lib/bleVisualLab.js`, `src/components/dev/BluetoothVisualLab.jsx`.
- **Pruebas:** `scripts/{femometer-shared,femometer-bridge}.test.mjs`; `android/app/src/test/java/com/fertiliapp/fertiliapp/{FemometerIdentityStoreTest,ThermometerDiscoveryTest,ThermometerVerificationTest,EasyHomeProfileTest}.java`.

`femometerLocalState.js` ya conserva las filas por deviceKey y `cycleDataHandler.js` ya vuelve a validar mediante `prepareManualBleDraft` y conserva los campos de origen comunes; se reutilizan sin modificar su persistencia ni las garantías transaccionales. Los campos nativos nuevos son aditivos al formato v3 y los registros Vinca anteriores mantienen sus claves y su protocolo histórico.
