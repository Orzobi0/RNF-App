# Dispositivos múltiples y recepción estándar experimental

Cambios preparados para revisión, sin commits ni publicaciones. Esta entrega continúa la infraestructura multimarca existente. Bluetooth sigue limitado a Android Staging.

## 1. Búsqueda y presentación

La tarjeta inicial contiene solamente las dos instrucciones solicitadas y Buscar termómetros. Al buscar desaparece y deja espacio al progreso y a los resultados. Buscar de nuevo es una acción compacta; la búsqueda ampliada aparece después de una búsqueda normal. Los dispositivos sin identificar llevan una descripción breve.

El nombre anunciado BM-Vinca2 permite presentar Femometer Vinca 2, su fotografía y Pulsa para vincular. Es una identificación preliminar: la inspección de identidad y servicios sigue siendo obligatoria antes de vincular o ejecutar operaciones específicas. Los demás candidatos conservan su nombre anunciado y Comprobar compatibilidad.

El aviso de éxito se reduce a Termómetro vinculado, confirmación y cierre. Las tarjetas muestran estados breves y abren una ruta con identificador opaco. Los ajustes de un dispositivo inactivo no muestran los resultados ni las incidencias del seleccionado.

Archivos: `src/pages/DevicesPage.jsx`, `src/components/Vinca2Panel.jsx`, `src/App.jsx`, `ThermometerDiscovery.java` y su prueba nativa.

## 2. Varias vinculaciones, una conexión

El almacenamiento nativo `thermometer_identity_v3` mantiene una colección por cuenta y una selección explícita. Migra la vinculación v2 conservando exactamente su deviceKey; para v1 conserva la migración de dirección antigua a identificador opaco. El commit de preferencias nativas debe completarse antes de exponer la migración. Las direcciones permanecen exclusivamente en Android.

Añadir un dispositivo conserva los anteriores. Volver a vincular una dirección guardada reutiliza su identificador. Cambiar al dispositivo guardado espera al cierre de la conexión anterior y selecciona un único objetivo para la reconexión automática. Un candidato incompatible no sustituye la lista ni la selección. Desvincular elimina solamente la entrada solicitada; si era la seleccionada no se elige otra automáticamente.

Las preferencias existentes, el historial y los pendientes ya están separados por deviceKey en `femometerLocalState.js`; se conserva ese formato sin migración destructiva. La sesión mantiene instantáneas de preferencias por dispositivo y no aplica los valores iniciales al volver a seleccionar uno guardado. Desvincular no borra mediciones.

Archivos: `FemometerIdentityStore.java`, `FemometerBle.java`, `src/lib/femometerBle.js`, `src/lib/femometerSession.js`, `src/components/Vinca2Panel.jsx` y `src/pages/DevicesPage.jsx`.

## 3. Recepción estándar de prueba

El perfil experimental exige Health Thermometer 0x1809, Temperature Measurement 0x2A1C, indicación y CCCD 0x2902. No exige Measurement Interval. El perfil Vinca 2 validado tiene prioridad y conserva su configuración específica.

Probar recepción requiere una inspección previa y una acción explícita. Utiliza el mismo propietario y transporte Bluetooth, activa solamente las indicaciones finales estándar y termina a los 60 segundos o al detenerla. No configura intervalo, reloj, volumen ni modo, ni envía comandos Vinca. Intermediate Temperature no se trata como una medición final.

El decodificador compartido valida el FLOAT IEEE 11073 y rechaza sus valores especiales. El perfil experimental además valida longitud exacta, flags reservados, fecha y tipo opcionales; convierte Fahrenheit a Celsius. Las fechas presentes pero inválidas o incompletas se rechazan en la prueba; no se inventa una fecha original.

Las lecturas viajan por un evento separado y se mantienen solamente en memoria (hasta 50). La sesión y el contexto también rechazan eventos experimentales en el flujo habitual. No se escriben en pendientes, Firebase, registros diarios ni interpretación del ciclo. Recibir una lectura no crea una vinculación ni declara compatibilidad funcional. Al terminar se cierra la conexión experimental y se conservan las vinculaciones y su selección.

Referencia: [Bluetooth SIG, Health Thermometer Service 1.0](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HTS_v1.0/out/en/index-en.html).

Archivos: nuevos `HealthThermometerProfile.java` y `TemperatureMeasurementCodec.java`; cambios en `FemometerBle.java`, `src/lib/femometerBle.js`, `src/lib/femometerSession.js`, `src/contexts/FemometerContext.jsx` y `src/pages/DevicesPage.jsx`.

## 4. Laboratorio y pruebas

El laboratorio incluye dos dispositivos con preferencias independientes y recepción estándar ficticia; permite búsqueda normal/ampliada, adición, selección, desvinculación individual y finalización de prueba. Archivos: `src/lib/bleVisualLab.js` y `src/components/dev/BluetoothVisualLab.jsx`.

Se ampliaron `scripts/femometer-shared.test.mjs`, `scripts/femometer-bridge.test.mjs`, `FemometerIdentityStoreTest.java`, `ThermometerDiscoveryTest.java` y el nuevo `TemperatureMeasurementCodecTest.java`. Cubren presentación preliminar sin vinculación anticipada, sustitución de instrucciones por resultados, selección y cierre serializados, preferencias independientes, fallos de adición, desvinculación individual y concurrente, cancelación y eventos tardíos, migración y decodificación, y aislamiento de las lecturas experimentales.

Resultado final de las comprobaciones ejecutadas:

| Comprobación | Resultado |
| --- | --- |
| `npm run check:staging` | Correcto |
| `npm run test:staging` | 135/135 |
| `node --test scripts/femometer-bridge.test.mjs` | 2/2 |
| `npm run build:staging` | Correcto, hashes y destino Staging verificados |
| `npm run sync:staging:android` | Correcto, posterior al último build |
| `git diff --check` | Sin errores de espacios |
| Gradle `:app:testDebugUnitTest assembleDebug`, con `CAPACITOR_ENV=staging` | Pendiente: acceso al bloqueo de la caché Gradle denegado; posterior solicitud de ejecución con permisos rechazada |
| Revisión visual en navegador | Pendiente: acceso al origen local rechazado |

No se ha generado ni validado una APK posterior a estos cambios. Las pruebas nativas añadidas todavía deben compilarse y ejecutarse. No se considera válida una APK anterior para esta entrega.

## Límites y comprobaciones físicas pendientes

Verificar en Android la migración de una instalación existente, dos Vinca 2 con preferencias diferentes, alternancia sin conexiones solapadas, recuperación tras interrupciones y conservación de pendientes al desvincular. Repetir recepción, histórico, reloj, volumen y modo del Vinca 2: su reconocimiento físico previo no valida estos nuevos cambios.

Probar un periférico HTS con indicaciones finales y sin intervalo, datos malformados, cancelación, desconexión y expiración de 60 segundos. La recepción genérica sigue siendo experimental: no permite alta definitiva de modelos desconocidos ni incorpora protocolos propietarios adicionales.

Revisar manualmente tamaños pequeños, cabecera, lista y navegación inferior. Se ha conservado el contenedor desplazable y añadido espacio inferior, pero no se da por comprobado el resultado visual debido al acceso denegado.

No se han modificado Firebase Functions, reglas, autenticación, interpretación RNF, Health Connect, configuración de producción ni WHATS_NEW_VERSION. No se han introducido dependencias.
