# Preparación Bluetooth multimarca — revisión por fases

Fecha: 18 de noviembre de 2026. Cambios locales, sin commits, publicación ni merge.

## Fase 0: revisión de temperaturas

Se conserva el diseño de `BleReadingReviewView.jsx`: descarte a la izquierda,
confirmación a la derecha y cierre con la X del contenedor.

En `scripts/femometer-shared.test.mjs`:

- El antiguo selector «Cancelar» se sustituye por la X accesible «Cerrar aviso»
  de `FemometerReviewCard`. Se verifica que no se guarda ni se consume la pendiente.
- La expectativa `ml-auto` se sustituye por las clases actuales del botón principal.
- El test del pie comprueba dos acciones en dos columnas, su orden, callbacks,
  bloqueo durante operaciones y la segunda confirmación necesaria ante duplicados.
- Los selectores encuentran texto anidado junto a iconos.
- Un test adicional del propietario real de sesión cierra el aviso, recupera la
  pendiente y su borrador desde almacenamiento y vuelve a abrir la revisión.

Antes de comenzar las fases siguientes: **120/120 pruebas correctas**.

## Fase 1: infraestructura y perfil

`FemometerBle` conserva la propiedad de las conexiones, permisos, ciclo de vida,
limpieza y transporte. No se introduce un segundo gestor de conexiones.

`Vinca2Profile` concentra modelo, protocolo, identificación, firma propietaria,
requisitos GATT y capacidades implementadas. La identidad debe coincidir con
BM-Vinca2 por el modelo consultado o, si no existe ese dato, por un nombre anunciado
delimitado. Un modelo DIS contradictorio prevalece sobre el nombre anunciado.
Además son obligatorios los canales propietarios, indicaciones y descriptores de
temperatura y la característica escribible de intervalo usada por el protocolo.

La identificación se repite en **cada conexión**, antes de activar indicaciones o
escribir configuración. Se mantienen los comandos y operaciones existentes de
histórico recibido, intervalo, reloj, volumen y modo. El servicio 0x1809 por sí solo
no habilita ninguno de esos comandos. Las capacidades JS exigen modelo, protocolo
y estado compatible, además de la capacidad concreta.

La consulta estándar de información se extrae del perfil a `BleDeviceInfoOperation`.
Su cola existente también realiza la identificación, restringida a modelo y
fabricante y con un presupuesto total de 4,5 segundos. Una consulta que falla o
expira cierra la conexión y requiere reintentar; no se continúa con escrituras.

Cada evento nativo conserva su identificador opaco y el modelo validado en esa
conexión. El modelo se normaliza y persiste en la lectura, sin consultar el modelo
conectado cuando se revisa posteriormente. No cambian las reglas de incorporación:
otros modelos siguen rechazados y toda incorporación requiere confirmación manual.

No se cambia `FemometerIdentityStore` ni sus claves/migración. Las vinculaciones
antiguas siguen siendo Vinca 2, el único modelo vinculable hasta ahora. Se conserva
el documento local v1 y todas las pendientes por dispositivo. El fallback Vinca 2
solo permanece para pendientes antiguas sin origen normalizado ni modelo recibido.
Las preferencias iniciales medio/normal solo se crean tras validar y vincular Vinca 2.

## Fase 2: búsqueda, clasificación e interfaz

La búsqueda normal acepta evidencia de servicio Health Thermometer, firma de
servicio conocida o nombres de posibles termómetros/marcas. Estos indicios no
declaran compatibilidad. Los dispositivos sin nombre con 0x1809 se incluyen;
auriculares y relojes sin indicios se excluyen.

«¿No encuentras tu termómetro?» solicita explícitamente una búsqueda ampliada.
La selección de un resultado permite una inspección acotada y de solo lectura.
No se consultan números de serie, no se envían comandos propietarios ni se
modifican dispositivos desconocidos. Las MAC permanecen en Android; se eliminan
patrones MAC de nombres y textos de identificación antes de enviarlos al frontend.

| Estado | Evidencia y comportamiento |
| --- | --- |
| Modelo compatible | Identidad Vinca 2 y todos sus requisitos GATT. Puede vincularse y escuchar. |
| Modelo reconocido sin soporte | Modelo y fabricante identificados; sin perfil validado. No puede vincularse. |
| Posible termómetro estándar | Anuncio 0x1809 o servicio y característica de temperatura inspeccionados, sin perfil validado. No puede vincularse. |
| Dispositivo desconocido | Información insuficiente. No puede vincularse. |

La presencia de temperatura estándar no demuestra uso basal. La vinculación
anterior se conserva para cualquier candidato no compatible o inspección fallida.
La búsqueda ampliada no realiza inspecciones automáticas de todos los resultados.

La pantalla inicial usa icono e instrucciones genéricas. Los resultados muestran
modelo/nombre, fabricante disponible y estado de compatibilidad. La fotografía
Vinca 2 se reserva a ese modelo. Configuración y diagnóstico usan las capacidades
y el origen de la lectura; los controles no disponibles se ocultan durante la
conexión. Desconectado, Vinca 2 conserva sus preferencias visibles y deshabilitadas.

El laboratorio incluye otro modelo reconocido, un candidato estándar sin nombre
y un BLE desconocido exclusivo de la búsqueda ampliada, además de los escenarios
anteriores de vinculación, errores, preferencias y pendientes.

## Inventario de archivos

Las fases comparten algunos archivos; esta agrupación identifica qué revisar sin
crear commits ni mezclar cambios con subsistemas ajenos.

Fase 0 y pruebas de regresión:

- `scripts/femometer-shared.test.mjs` (tres correcciones iniciales, fixtures actualizados y siete pruebas adicionales).

Infraestructura/perfil y origen, fases 1–2:

- `android/app/src/main/java/com/fertiliapp/fertiliapp/FemometerBle.java`
- `android/app/src/main/java/com/fertiliapp/fertiliapp/Vinca2Profile.java`
- `android/app/src/main/java/com/fertiliapp/fertiliapp/BleDeviceInfoOperation.java`
- `android/app/src/main/java/com/fertiliapp/fertiliapp/ThermometerDiscovery.java` (nuevo)
- `src/lib/femometerSession.js`
- `src/lib/femometerBle.js`
- `src/lib/thermometerCapabilities.js`
- `src/lib/femometerLocalState.js`
- `src/lib/bleMeasurements.js`
- `src/contexts/FemometerContext.jsx`
- `src/components/BleReadingReview.jsx`
- `src/components/FemometerReviewCard.jsx`

Interfaz y laboratorio, fase 2:

- `src/pages/DevicesPage.jsx`
- `src/components/Vinca2Panel.jsx`
- `src/components/Vinca2Diagnostics.jsx`
- `src/components/dev/BluetoothVisualLab.jsx`
- `src/lib/bleVisualLab.js`

Pruebas adicionales y documentación:

- `scripts/femometer-bridge.test.mjs`
- `android/app/src/test/java/com/fertiliapp/fertiliapp/BleDeviceInfoOperationTest.java`
- `android/app/src/test/java/com/fertiliapp/fertiliapp/ThermometerDiscoveryTest.java` (nuevo)
- `docs/bluetooth-multibrand.md` (este documento)

## Validación

- `npm run check:staging`: correcto.
- `npm run test:staging`: **127/127 correctas**.
- `npm run build:staging`: correcto, incluidos hashes y entorno de Staging.
- `npm run sync:staging:android`: correcto con el último build web.
- `node --test scripts/femometer-bridge.test.mjs`: **2/2 correctas**.
- `CAPACITOR_ENV=staging`, JDK Android Studio2,
  `gradlew.bat :app:testDebugUnitTest assembleDebug`: **32 pruebas nativas correctas
  y BUILD SUCCESSFUL** en la compilación anterior al ajuste final de origen.
- `git diff --check`: sin errores de whitespace.

La última recompilación Android fue solicitada y su permiso fue rechazado. Por
tanto, el cambio final de `FemometerBle` que toma `temperatureDeviceModel` del
resultado de identificación, en vez de la constante del perfil, **no está
recompilado**. La APK ya generada tampoco incluye los últimos cambios visuales
sincronizados después de esa compilación. No se presenta esa APK como paquete final.

No se han modificado Firebase Functions, reglas, autenticación, interpretación
del ciclo, Health Connect ni configuración de producción. No hay dependencias nuevas.

## Límites y comprobaciones físicas pendientes

- Recompilar el estado final de Android Staging antes de instalarlo.
- Validar Vinca 2 real: anuncios, identificación DIS, recepción en vivo y buffered,
  reloj, volumen, modo, reconexión y ciclos de segundo/primer plano.
- Probar dispositivos reales de otra marca, sin nombre, estándar y BLE irrelevantes;
  comprobar que no reciben escrituras durante inspección y que no sustituyen el vínculo.
- Comprobar con firmware distinto los requisitos de firma e identificación: la
  política deliberadamente rechaza perfiles incompletos o contradictorios.
- Probar pérdida de conexión y respuestas tardías durante los dos campos DIS.
- Verificar visualmente en móvil físico el flujo completo de búsqueda y revisión.
  La comprobación de interfaz realizada aquí es automatizada mediante los componentes
  y el laboratorio; no se ha realizado una sesión manual en navegador autenticado.
- La búsqueda normal es heurística y puede omitir dispositivos sin indicios; para
  ellos existe la búsqueda ampliada. Reconocer un nombre/modelo no certifica hardware.
- No se implementan escucha estándar genérica, Easy@Home, validación guiada ni
  conexiones simultáneas. Solo Vinca 2 puede completar la vinculación funcional.
