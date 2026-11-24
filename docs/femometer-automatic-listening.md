# Recepción automática Vinca 2 — Android Staging

La sesión pertenece a la cuenta autenticada y se comparte entre páginas. La búsqueda automática del Vinca 2 vinculado admite hasta 12 segundos y termina al encontrar la identidad correcta; la búsqueda dirigida manual conserva hasta 25 segundos. No se amplía la compatibilidad ni se solicitan permisos automáticamente. Web/PWA y producción mantienen sus barreras actuales.

## Evidencia y preparación

La captura HCI aportada muestra conexión a las 11:21:45, sincronización a las 11:21:47, indicaciones preparadas a las 11:21:49 y recepción espontánea de 35,77 °C a las 11:24:23. El timestamp transmitido fue 11:21:41: puede representar el inicio de una toma anterior a la sincronización, no su final ni su recepción. Esta observación no demuestra que cualquier indicación posterior a conectar sea nueva.

Se mantienen la recepción de temperatura final por UUID 0x2A1C, la suscripción propietaria `3f3e3d3c-3b3a-3938-3736-353433323130` y la escritura de preparación `01 00` en Measurement Interval (0x2A21). No se usan handles ATT como UUID ni se repiten escrituras como sondeo de históricos.

## Conexión y recuperación

1. Al abrir la app se busca el termómetro vinculado: «Buscando termómetro…».
2. Se establece BLE, valida identidad/perfil y prepara las indicaciones: «Conectando…».
3. Solo con conexión e indicaciones preparadas se muestra «Conectado». Una sesión Vinca 2 validada no tiene el corte de seis minutos; los otros perfiles conservan sus plazos.
4. La app recibe la temperatura cuando el dispositivo la indica, incluso después de seis minutos, sin solicitarla justo antes ni renovar una conexión sana.
5. Navegar y recibir un evento de primer plano con la sesión todavía preparada no reconecta. Los callbacks nativos de pérdida/error invalidan la sesión y permiten la recuperación ordenada.
6. Cada apertura o retorno real desde segundo plano dispone de dos búsquedas automáticas como máximo: hasta 12 segundos, espera de 8 segundos desde que termina el primer intento y otra búsqueda de hasta 12 segundos. Los límites afectan al escaneo, no a los plazos separados de conexión/GATT. Si conecta, se cancela el temporizador; no existe sondeo periódico de una conexión sana. Una pérdida puede consumir únicamente el intento restante de esa ventana.
7. Tras agotar la ventana, encender el termómetro más tarde no provoca nuevos escaneos. «Conectar»/«Reconectar» sigue disponible y conserva el plazo manual. Los eventos repetidos de app activa y la navegación no reinician el presupuesto.
8. Suspensión, desconexión explícita, cambio de cuenta/vinculación, desvinculación y desmontaje invalidan el trabajo pendiente. Bluetooth/permisos no disponibles y errores no recuperables detienen la recuperación. Si una incorporación u operación GATT bloquea temporalmente el reintento, este queda pendiente hasta liberar el bloqueo, sin consumir intentos ni solapar operaciones. Los diagnósticos de sesión distinguen inicio, reintento, éxito, agotamiento, petición manual, primer plano y cancelación, sin nuevos identificadores sensibles.

Se conservan los timeouts de conexión, descubrimiento, preparación y operaciones GATT. Suspender la app sigue cerrando GATT y cancela los temporizadores; al volver se recupera. No hay servicio de escucha permanente en segundo plano. El apagado/encendido del termómetro requiere validar físicamente los callbacks y la recuperación; no se promete detección instantánea de un apagado sin aviso BLE.

## Trazabilidad y duplicados

Cada conexión genera un UUID aleatorio sin MAC, con instantes de conexión, indicaciones preparadas y recepción en milisegundos. El timestamp original del dispositivo se conserva separado. JavaScript marca si hubo otro intento de conexión durante la sesión de esa cuenta. Los tiempos describen transporte, no identidad ni novedad de la toma; `reconnect` tampoco acredita que el dispositivo estuviera midiendo. Estos metadatos mínimos permanecen en la revisión local, fuera del registro clínico normalizado y sin paquetes crudos.

En una conexión Vinca se filtran paquetes completos idénticos con timestamp válido, mediante una memoria acotada a 256 paquetes. Cambiar los segundos u otro byte conserva la entrada; paquetes sin fecha válida no se suprimen. Una nueva conexión reinicia este filtro. Una retransmisión después de reconectar o tras expulsar un paquete de la memoria continúa sujeta a las comprobaciones locales y del día de destino en Firestore. La coincidencia de temperatura/minuto es sospecha de duplicado y exige revisión, nunca una identidad inequívoca.

## Reloj y guardado automático

Automática requiere consentimiento `v2`. Se lee el reloj al preparar la conexión; una referencia válida evita escrituras innecesarias. Si falta referencia o hay fecha imposible/desfase superior a 120 segundos, se mantiene una sincronización con verificación posterior. No se escribe periódicamente el reloj.

Se distinguen la última sincronización y el inicio de un intervalo de confianza (`confidenceStart`). Una sincronización redundante conserva el inicio anterior únicamente si hubo una lectura correcta posterior a esa referencia y anterior a la escritura, sin incidencias, invalidación ni cambio de zona. Una corrección real o confianza interrumpida inicia otro intervalo. Los historiales anteriores siguen usando conservadoramente su última sincronización.

Así, una toma iniciada antes de la última sincronización puede ser candidata automática si es posterior a una referencia previa que sigue siendo válida. No se añade un margen de minutos ni se usa la hora de recepción como prueba de novedad. Si la toma precede a la primera referencia fiable, incluso el caso observado de 11:21:41/11:24:23, permanece pendiente: «La toma empezó antes de la referencia fiable del reloj. Puede ser reciente o retransmitida; confirma su fecha».

Una lectura idéntica del reloj tras más de cinco segundos en la misma conexión se trata como posible snapshot fijo. No prueba desfase ni establece confianza nueva. Se conserva la conexión y la toma pasa a revisión por falta de comprobación posterior; se comprobará otra vez en la siguiente conexión natural o solicitada expresamente. No se interrumpe una toma para resolver ese diagnóstico.

El guardado automático mantiene fecha original válida de hoy/ayer, zona sin ambigüedad, referencia anterior y comprobación posterior, identidad y cuenta vigentes, consentimiento, destino inequívoco y búsqueda de duplicados local y en el día de destino del servidor. El cliente y la transacción reutilizan `prepareAutomaticBleDraft`; esta vuelve a validar al incorporar y antes de escribir. Una escritura incierta no se reintenta automáticamente. Fechas futuras/imposibles, incidencias, cambios de cuenta/dispositivo, destino ambiguo, coincidencias o fallos de consulta/guardado siguen requiriendo revisión.

## Tres conceptos distintos

- **Recibida espontáneamente:** el callback entrega una indicación sin una solicitud inmediata. Puede ser reciente o retransmitida.
- **Recibida después de reconectar:** llega en otra sesión de transporte. Puede proceder de memoria; reconectar no acredita novedad.
- **Suficientemente verificada para incorporación automática:** supera las condiciones operativas de fecha, identidad, consentimiento, destino y duplicados. No implica disponer de un identificador único del firmware.

Los 17 fragmentos propietarios posteriores y aproximadamente 143 valores observados describen una evolución térmica. No se ha demostrado identificador de toma ni marcador de novedad. Se conserva la captura diagnóstica y sus límites; no se añade descifrado, asociación especulativa entre canales ni comandos propietarios nuevos.

## Interfaz y alcance

Se reutilizan panel, diagnóstico y revisión. Las nuevas candidatas automáticas llevan una marca de presentación en memoria (`automaticProcessing`); se conservan como `pending`/`saving` en el almacenamiento existente. El contador y la selección manual excluyen solo esas candidatas mientras se procesan. Al fallar o no poder comenzar, vuelven a revisión. La espera para comenzar tiene un límite visual de 30 segundos y una operación iniciada, de 120 segundos: excederlo hace accesible la lectura, pero nunca desbloquea ni repite una escritura que aún no ha terminado. Las lecturas restauradas no se automatizan por su antigua elegibilidad; un guardado interrumpido sigue siendo incierto.

El aviso solo se genera al confirmar el guardado y permanece en el gestor autenticado por encima de las rutas. Navegar o pulsar fuera ya no lo descarta. Se mantienen cierre explícito, gesto y «Ver día», agrupación y deduplicación por lectura; cambiar de cuenta desmonta el aviso anterior.

 Vinca 2 no muestra una cuenta atrás de seis minutos. Se mantienen Añadir, búsqueda explícita, cancelación, vinculación/desvinculación, ajustes y elección manual/automática. El primer guardado manual validado conserva la pregunta persistente de automatización. No se modifican Functions, Rules, secretos, Health Connect ni dependencias.

## Validación física pendiente

Probar con APK Staging y Vinca 2: toma superior a seis minutos, recepción final inmediata, varias tomas de igual temperatura, apagado/encendido, navegación, bloqueo/desbloqueo y suspensión real de Android. Contrastar reloj que avanza frente a snapshot fijo, toma anterior a primera sincronización, retransmisiones, pérdida de permisos/Bluetooth, fallos consecutivos, cambio de cuenta y Firebase offline/resultado incierto. Las pruebas con transporte/Firebase simulados y JVM no acreditan el firmware ni sustituyen estas comprobaciones.


## Verificación de esta modificación (21/11/2026)

- `node --test scripts/femometer-shared.test.mjs scripts/ble-measurements.test.mjs scripts/femometer-bridge.test.mjs scripts/ble-manual-import.test.mjs scripts/staging-isolation.test.mjs`: 361 pruebas superadas.
- Cobertura: conexión preparada más allá de seis minutos y recepción a los quince; navegación/primer plano sin renovación; desconexión, recuperación y tres fallos con esperas; paquetes idénticos y retransmisiones; toma anterior a sincronización redundante frente a primera referencia/corrección; snapshot fijo; cuenta/dispositivo y destino; Firebase simulado, guardado pendiente/incierto; modo manual, perfiles experimentales y aislamiento de Staging.
- Compilación directa con `javac` de las fuentes BLE actuales, incluido `FemometerBle`, contra Android SDK 34 y las clases locales de Capacitor. JUnit: 52 pruebas de las 13 clases de test BLE, incluidas las tres nuevas de `Vinca2ReceptionTest`, superadas. Solo aviso de API obsoleta.
- `npm run check:staging`: correcto. `npm run build`: compilación Staging y verificación de hashes/aislamiento correctas. `git diff --check`: sin errores.
- Gradle `testDebugUnitTest` no se completó: su caché fuera del proyecto no era escribible bajo el sandbox y se rechazó la elevación solicitada. La compilación/JUnit directa usó dependencias locales en lectura y salida dentro del proyecto; no equivale a ensamblar ni instalar una APK. No se ejecutaron pruebas físicas ni pruebas contra Firebase real.


## Recuperación de fecha y comprobación posterior (21/11/2026)

Revisión realizada sobre `nov26`, commit `f88d1764`, sin cambios locales iniciales. Se conserva el transporte, suscripciones, preparación y duración de la conexión.

- El Vinca validado comprueba ahora longitud exacta, flags reservados, FLOAT finito/no especial, tipo opcional y temperatura convertida entre 32 y 43 °C. Solo el Date Time puede ser inválido: se entrega la temperatura para revisión con fecha nula y fiabilidad `invalid` (o `missing` sin campo). Fechas interpretables, incluidas 2024/2099, conservan su timestamp original. Los perfiles estándar conservan su validación estricta de fecha.
- El decodificador Vinca anterior ya conservaba fechas inválidas como nulas, pero omitía la validación estructural completa. No era correcto atribuirle un rechazo sistemático por fecha: la mejora endurece la estructura sin perder la recuperación.
- Fechas fuera de hoy/ayer, futuras, ausentes o inválidas no precargan el destino en la revisión. Se muestra el mensaje de recuperación, fecha original disponible y fecha/hora elegidas. Un borrador explícitamente editado se conserva. La hora de recepción nunca sustituye la fecha original. La cola y sus garantías de cuenta, persistencia y guardado incierto no cambian.
- Se mantiene la corrección inicial única por conexión con lectura de verificación. Una referencia verificada previa y una lectura correcta evitan escrituras redundantes; el primer consentimiento automático puede necesitar una sincronización para establecer una referencia trazable. Ni conectar ni una instantánea fija acreditan una referencia nueva.
- La comprobación posterior fallaba con un mensaje genérico porque el reloj repetía la instantánea de la conexión. Ahora distingue esta situación y una operación que no pudo iniciarse: esta última no puede reutilizar un resultado anterior. Las fechas incorrectas pasan a revisión antes de solicitar otra lectura del reloj.
- No se habilita una reconexión automática tras la temperatura final: el protocolo conocido no acredita que haya terminado toda la recepción ni que no haya otra toma activa. Se ofrece reconexión explícita cuando la usuaria haya terminado todas las mediciones. Una lectura fresca en la siguiente conexión permite comprobar el reloj; no reintenta automáticamente una pendiente ya revisada por el proceso automático ni certifica novedad de lecturas almacenadas.
- Permanecen automáticas únicamente las nuevas candidatas que cumplan consentimiento v2, cuenta/dispositivo/ciclo vigentes, fecha original de hoy/ayer no futura ni ambigua, intervalo fiable anterior a la toma, comprobación posterior válida, ausencia de incidencias y duplicados y escritura confirmada. `prepareAutomaticBleDraft` sigue validándose tanto en el cliente como antes de escribir en la transacción. Un snapshot conserva la referencia previa sin extenderla y exige revisión manual para esa toma.
- La interfaz Vinca usa «Vinculado» para asociación, «Conectado» para GATT/indicaciones preparados, «Desconectado», búsqueda/preparación y errores específicos. Controles: «Desconectar» y «Reconectar». Se conserva el diagnóstico técnico y el vocabulario de otros modelos.

Se amplían las pruebas de recuperación 2024/2099/fecha ausente, persistencia por cuenta, destino manual elegido, estructura inválida, sincronización única y operación posterior omitida. La suite existente cubre snapshot, continuidad, automatización posterior, duplicados, cambios de cuenta/dispositivo/ciclo, fallos de Firebase y recepción prolongada. **No se ejecutaron los tests JavaScript Bluetooth ni Java por indicación de este encargo**; las cifras de la sección anterior corresponden al trabajo previo. La validación física sigue pendiente y no se ha realizado despliegue ni cambio de backend.

Validación de esta revisión: `npm run build` de Staging y comprobación de aislamiento/hashes correctas; `git diff --check` sin errores. No se ensambló ni instaló APK.

## Validación de recuperación y presentación (23/11/2026)

- Bloque A: ventana automática 12 s + espera 8 s + 12 s, conexión continua y recuperación manual; diagnósticos en el panel existente. Bloque B: contador de intervención separado del procesamiento en memoria y aviso confirmado que sobrevive a la navegación. Los bloques no dependen uno del otro; las pruebas compartidas y esta documentación se pueden seleccionar por fragmentos para commits separados.
- Suites Bluetooth: 164 pruebas superadas; suite Staging: 184 superadas (incluye pruebas compartidas, no son cifras sumables). `check:staging`, `build:staging`, `sync:staging:android` y `git diff --check` correctos.
- Gradle `testDebugUnitTest assembleDebug` no se ejecutó: el primer intento no tenía JDK configurado; con Android Studio2/jbr, el sandbox impidió escribir el bloqueo de la caché `.gradle`. Se solicitó permiso y fue rechazado. No se generó una APK nueva ni se validó Java mediante Gradle.
- Sin pruebas físicas, Firebase real, commits ni despliegues. Se conserva sin modificación la corrección local previa del decodificador (`recoverDate ? 0x78 : 0xf8`).
- Para probar físicamente, configurar `JAVA_HOME` al JDK instalado y `CAPACITOR_ENV=staging`, ejecutar desde `android/` `gradlew.bat testDebugUnitTest assembleDebug` e instalar `app/build/outputs/apk/debug/app-debug.apk`. La configuración existente usa `server.url=https://fertiliapp-staging.web.app`: la APK por sí sola NO activa este frontend local. Antes de comprobar los dos bloques juntos debe servirse esta revisión mediante el flujo de desarrollo Android aprobado o publicarse en Staging con autorización posterior; aquí no se cambia ese flujo ni se despliega.
- Con el frontend correcto: termómetro encendido al abrir (un intento), apagado durante ambos intentos (12/8/12, sin tercero), encendido durante el segundo (conexión inmediata), encendido diez minutos después (solo Conectar), recepción de varias tomas y de una toma de más de seis minutos; navegar entre dashboard/gráfica/registros/ajustes sin reinicio. Repetir segundo plano/retorno, desconexión explícita, cuenta/vinculación, permisos y Bluetooth apagados. Con consentimiento automático, comprobar ausencia de contador durante verificación/guardado, aviso confirmado persistente, cierre/gesto/Ver día, lectura manual simultánea, fecha/reloj incorrectos, duplicados y error/resultado incierto offline, incluido reinicio.

## Bloque A — alcance del guardado automático (24/11/2026)

`incorporateBleMeasurementDB` deja de consultar los registros y mediciones de todos los ciclos. Conserva las consultas de rangos de ciclos y su revalidación transaccional, el consentimiento v2 y la revisión del documento de preferencias que serializa incorporaciones. No cambia la ruta manual.

Solo compara la temperatura entrante con las mediciones del día de destino, mediante `isPossibleBleDuplicate`. Una coincidencia de dispositivo, temperatura original y minuto original requiere revisión; no descarta la lectura. Se conserva el filtro nativo de paquetes de la misma conexión. Una lectura trasladada manualmente a otro día puede volver a incorporarse en su día original: limitación aceptada, sin búsqueda global ni índice adicional.

Se mantiene la consulta de registros del ciclo actual para resolver documentos antiguos cuya fecha se obtiene del timestamp, IDs antiguos y días duplicados. Consultar únicamente `iso_date` o `entries_by_iso` no cubriría esos documentos sin migración. Esta consulta no se usa para comparar temperaturas de otros días en automático y no descarga sus subcolecciones. Solo se consultan las mediciones del destino; se releen dentro de la transacción junto con el padre y la revisión del día. Las escrituras simultáneas provocan reintento/conflicto y revisión cuando cambia el día. Se conservan selección basal, correcciones, otras mediciones y campos del registro.

En desarrollo (`import.meta.env.DEV`), después de la confirmación, `[BLE automatic timing]` muestra exclusivamente duraciones en milisegundos: validación/consultas previas, comprobaciones del día dentro de los intentos completados del callback, transacción completa (incluidos reintentos y confirmación) y total. Las comprobaciones del día son parte del tiempo de transacción: no se suman a él. No se emite éxito ni tiempos de confirmación si falla el guardado. El build de Staging no activa estos logs; se necesita frontend de desarrollo para medirlos. No hay telemetría ni valores clínicos/identificadores en este diagnóstico.

La prueba de Firestore simulado con dos ciclos archivados y otro día en el ciclo actual verifica exactamente cuatro consultas de colección por incorporación sin reintentos: ciclos, registros actuales, revalidación de ciclos, mediciones del destino. Verifica además ausencia de lecturas transaccionales de los días ajenos, retransmisión del mismo día, concurrencia y consentimiento. No se han medido tiempos de Firestore real ni se promete una duración de guardado.

## Bloque B — revisión detenida; recepción bloqueada aún no implementada (24/11/2026)

El comportamiento actual sigue cerrando la conexión al suspender. No existe todavía ventana nativa de seis minutos, cola nativa duradera ni notificación de recepción temporal. No considerar esta documentación una implementación o validación física de B.

El proyecto usa Capacitor 5, minSdk 26 y compile/targetSdk 34. Android documenta el servicio en primer plano `connectedDevice` iniciado mientras la app es visible para conservar una conexión BLE. Requiere `FOREGROUND_SERVICE`, y con target 34 `FOREGROUND_SERVICE_CONNECTED_DEVICE`, además del permiso Bluetooth correspondiente ya concedido. Su notificación obligatoria tendría que aparecer desde su preparación en primer plano; no se puede esconder hasta `handleOnStop`. Referencias: [BLE en segundo plano](https://developer.android.com/develop/connectivity/bluetooth/ble/background) y [tipos de servicio Android 14](https://developer.android.com/about/versions/14/changes/fgs-types-required).

Motivo de la parada solicitada antes de una solución frágil: `FemometerBle.java` mantiene `temperatureGatt`, sus callbacks anónimos, operaciones de reloj/configuración y cierre dentro del plugin de Capacitor. `handleOnStop` y `handleOnDestroy` terminan esa sesión. Un servicio que solo retuviera el plugin seguiría dependiendo de la instancia del puente/interfaz; transferir únicamente el objeto GATT no transfiere sus callbacks ni su estado de operaciones. La separación a un propietario nativo independiente afectaría al inicio de escucha, callbacks, operaciones y cierre del plugin; no se ha hecho esa extracción arquitectónica en este cambio. `MainActivity`, `femometerSession.js` y `FemometerContext.jsx` tendrían que coordinar el retorno sin volver a conectar ni seguir cerrando desde React.

Existe además una condición sin resolver para el cierre temprano: `Vinca2Reception` filtra paquetes y conserva procedencia, pero no identifica el fin de los fragmentos propietarios posteriores a la temperatura final. La documentación disponible no acredita un marcador de fin ni un intervalo de silencio seguro. Cortar al primer valor, inventar un plazo corto o mantener siempre seis minutos no satisface lo solicitado. Hace falta establecer ese criterio con evidencia de transmisión antes de prometer el cierre seguro.

El diseño pendiente debe contar seis minutos desde la primera suspensión real (sin renovación por eventos repetidos), cancelar el vencimiento al volver y conservar la misma conexión. Sin conexión preparada no debe arrancar nada. Debe persistir las lecturas en almacenamiento privado nativo por cuenta/dispositivo, entregarlas a `femometerLocalState` y retirar cada una solo tras confirmación duradera; el evento y la recuperación deben compartir una identidad de entrega local, sin atribuir identidad única a la toma. Los resultados Firestore inciertos deben seguir en revisión. No se ha añadido ese mecanismo ni almacenamiento, ni se ha modificado el protocolo. Un servicio tampoco garantiza supervivencia de GATT tras finalización forzosa del proceso.

Para probar A en un móvil, `server.url` continúa apuntando a `https://fertiliapp-staging.web.app`. Los assets locales sincronizados no sustituyen esa web remota. No se ha desplegado esta revisión ni verificado la versión efectivamente cargada por un móvil (puede intervenir su caché). Hace falta servir el frontend de esta revisión mediante el flujo aprobado o autorizar posteriormente un despliegue a Staging. B necesita implementación y validación adicional antes de poder probar ambos bloques juntos.

### Validación de esta revisión

- Estado inicial: rama `nov26`, commit `93218489dcecbd97f1484085418a1dd096ee79a2`, sin cambios locales.
- Suites solicitadas `ble-manual-import`, `ble-measurements`, `femometer-shared`, `femometer-bridge`, más `temperature-persistence` y `temperature-measurements`: 236 pruebas superadas. `test:staging`: 184 superadas; hay cobertura compartida, no sumar las cifras.
- `check:staging`, `build:staging`, `sync:staging:android` y `git diff --check`: correctos.
- `CAPACITOR_ENV=staging`, JDK de `Android Studio2/jbr`, `gradlew.bat testDebugUnitTest assembleDebug`: bloqueado por acceso denegado al archivo de bloqueo de la caché de Gradle fuera del repositorio. Se solicitó permiso para reejecutar y fue rechazado. No se ejecutaron pruebas Java ni se generó una APK nueva en esta revisión.
- Sin hardware ni Firestore real. Sin modificaciones Java/JSX, Manifest, protocolo, Rules, Functions o esquemas; sin commits, push, PR ni despliegues. A puede guardarse de forma independiente; B contiene únicamente análisis/documentación, no una implementación lista para un segundo commit funcional.
