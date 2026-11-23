# Recepción automática Vinca 2 — Android Staging

La sesión pertenece a la cuenta autenticada y se comparte entre páginas. La búsqueda del dispositivo vinculado admite hasta 25 segundos y termina al encontrar la identidad correcta. No se amplía la compatibilidad ni se solicitan permisos automáticamente. Web/PWA y producción mantienen sus barreras actuales.

## Evidencia y preparación

La captura HCI aportada muestra conexión a las 11:21:45, sincronización a las 11:21:47, indicaciones preparadas a las 11:21:49 y recepción espontánea de 35,77 °C a las 11:24:23. El timestamp transmitido fue 11:21:41: puede representar el inicio de una toma anterior a la sincronización, no su final ni su recepción. Esta observación no demuestra que cualquier indicación posterior a conectar sea nueva.

Se mantienen la recepción de temperatura final por UUID 0x2A1C, la suscripción propietaria `3f3e3d3c-3b3a-3938-3736-353433323130` y la escritura de preparación `01 00` en Measurement Interval (0x2A21). No se usan handles ATT como UUID ni se repiten escrituras como sondeo de históricos.

## Conexión y recuperación

1. Al abrir la app se busca el termómetro vinculado: «Buscando termómetro…».
2. Se establece BLE, valida identidad/perfil y prepara las indicaciones: «Conectando…».
3. Solo con conexión e indicaciones preparadas se muestra «Conectado». Una sesión Vinca 2 validada no tiene el corte de seis minutos; los otros perfiles conservan sus plazos.
4. La app recibe la temperatura cuando el dispositivo la indica, incluso después de seis minutos, sin solicitarla justo antes ni renovar una conexión sana.
5. Navegar y recibir un evento de primer plano con la sesión todavía preparada no reconecta. Los callbacks nativos de pérdida/error invalidan la sesión y permiten la recuperación ordenada.
6. Tras una pérdida se muestra «Desconectado». La comprobación cada 60 segundos solo busca si falta conexión. Los fallos de recuperación aumentan las esperas a 120 y 240 segundos y se detienen tras tres fallos; primer plano o Conectar permite otro intento. No hay conexiones ni suscripciones simultáneas.

Se conservan los timeouts de conexión, descubrimiento, preparación y operaciones GATT. Suspender la app sigue cerrando GATT y cancela los temporizadores; al volver se recupera. No hay servicio de escucha permanente en segundo plano. El apagado/encendido del termómetro requiere validar físicamente los callbacks y la recuperación; no se promete detección instantánea de un apagado sin aviso BLE.

## Trazabilidad y duplicados

Cada conexión genera un UUID aleatorio sin MAC, con instantes de conexión, indicaciones preparadas y recepción en milisegundos. El timestamp original del dispositivo se conserva separado. JavaScript marca si hubo otro intento de conexión durante la sesión de esa cuenta. Los tiempos describen transporte, no identidad ni novedad de la toma; `reconnect` tampoco acredita que el dispositivo estuviera midiendo. Estos metadatos mínimos permanecen en la revisión local, fuera del registro clínico normalizado y sin paquetes crudos.

En una conexión Vinca se filtran paquetes completos idénticos con timestamp válido, mediante una memoria acotada a 256 paquetes. Cambiar los segundos u otro byte conserva la entrada; paquetes sin fecha válida no se suprimen. Una nueva conexión reinicia este filtro. Una retransmisión después de reconectar o tras expulsar un paquete de la memoria continúa sujeta a las comprobaciones locales y de todo el historial en Firestore. La coincidencia de temperatura/minuto es sospecha de duplicado y exige revisión, nunca una identidad inequívoca.

## Reloj y guardado automático

Automática requiere consentimiento `v2`. Se lee el reloj al preparar la conexión; una referencia válida evita escrituras innecesarias. Si falta referencia o hay fecha imposible/desfase superior a 120 segundos, se mantiene una sincronización con verificación posterior. No se escribe periódicamente el reloj.

Se distinguen la última sincronización y el inicio de un intervalo de confianza (`confidenceStart`). Una sincronización redundante conserva el inicio anterior únicamente si hubo una lectura correcta posterior a esa referencia y anterior a la escritura, sin incidencias, invalidación ni cambio de zona. Una corrección real o confianza interrumpida inicia otro intervalo. Los historiales anteriores siguen usando conservadoramente su última sincronización.

Así, una toma iniciada antes de la última sincronización puede ser candidata automática si es posterior a una referencia previa que sigue siendo válida. No se añade un margen de minutos ni se usa la hora de recepción como prueba de novedad. Si la toma precede a la primera referencia fiable, incluso el caso observado de 11:21:41/11:24:23, permanece pendiente: «La toma empezó antes de la referencia fiable del reloj. Puede ser reciente o retransmitida; confirma su fecha».

Una lectura idéntica del reloj tras más de cinco segundos en la misma conexión se trata como posible snapshot fijo. No prueba desfase ni establece confianza nueva. Se conserva la conexión y la toma pasa a revisión por falta de comprobación posterior; se comprobará otra vez en la siguiente conexión natural o solicitada expresamente. No se interrumpe una toma para resolver ese diagnóstico.

El guardado automático mantiene fecha original válida de hoy/ayer, zona sin ambigüedad, referencia anterior y comprobación posterior, identidad y cuenta vigentes, consentimiento, destino inequívoco y búsqueda de duplicados local y en todo el historial del servidor. El cliente y la transacción reutilizan `prepareAutomaticBleDraft`; esta vuelve a validar al incorporar y antes de escribir. Una escritura incierta no se reintenta automáticamente. Fechas futuras/imposibles, incidencias, cambios de cuenta/dispositivo, destino ambiguo, coincidencias o fallos de consulta/guardado siguen requiriendo revisión.

## Tres conceptos distintos

- **Recibida espontáneamente:** el callback entrega una indicación sin una solicitud inmediata. Puede ser reciente o retransmitida.
- **Recibida después de reconectar:** llega en otra sesión de transporte. Puede proceder de memoria; reconectar no acredita novedad.
- **Suficientemente verificada para incorporación automática:** supera las condiciones operativas de fecha, identidad, consentimiento, destino y duplicados. No implica disponer de un identificador único del firmware.

Los 17 fragmentos propietarios posteriores y aproximadamente 143 valores observados describen una evolución térmica. No se ha demostrado identificador de toma ni marcador de novedad. Se conserva la captura diagnóstica y sus límites; no se añade descifrado, asociación especulativa entre canales ni comandos propietarios nuevos.

## Interfaz y alcance

Se reutilizan panel, diagnóstico y revisión. Vinca 2 no muestra una cuenta atrás de seis minutos. Se mantienen Añadir, búsqueda explícita, cancelación, vinculación/desvinculación, ajustes y elección manual/automática. El primer guardado manual validado conserva la pregunta persistente de automatización. No se modifican Functions, Rules, secretos, Health Connect ni dependencias.

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
