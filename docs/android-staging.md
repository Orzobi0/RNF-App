# Android Staging: remoto e incorporado

> El usuario confirma que la APK incorporada con Capacitor 8.6.3/API 36/Java 21 compila, se instala, conserva sesión y muestra ciclos/registros. AND-01 sigue abierto: falta completar la matriz física. AND-05A corrige las regresiones visuales observadas en Android 16; sus cambios todavía requieren generar e instalar otra APK.

Ambas modalidades usan `com.fertiliapp.fertiliapp.staging` y Firebase `fertiliapp-staging`. Se instalan sobre la misma app; no pueden convivir como dos apps independientes.

Desde la raíz del repositorio, en `nov26`, ejecutar localmente:

```powershell
# Una vez antes de preparar cualquiera de las modalidades, y tras cambios React:
npm run build:staging

# Elegir SOLO una:
npm run sync:staging:android:remote
npm run sync:staging:android:embedded
```

`npm run sync:staging:android` conserva su significado anterior: remoto. Los comandos de sync no compilan React; exigen `dist-staging` previamente compilado y verificado. Para volver a remoto basta ejecutar el comando remoto, sin editar archivos. Si se ha cambiado React, compilar primero de nuevo.

- **Remoto:** conserva `server.url = https://fertiliapp-staging.web.app`. Los cambios publicados en Hosting aparecen sin reinstalar. El build local no publica cambios en Hosting.
- **Incorporado:** omite `server.url` y copia `dist-staging` dentro de la APK. Los cambios React requieren volver a compilar web, sincronizar y generar/instalar otra APK.

La selección se pasa al proceso Capacitor mediante `CAPACITOR_STAGING_MODE`; los scripts fijan siempre Staging y la modalidad indicada, sin depender de variables heredadas. No usar `cap sync` directamente para este flujo. No dejar `CAPACITOR_ENV=production` en el entorno de Android Studio; debe estar ausente o valer `staging`. Dejar también ausente `CAPACITOR_STAGING_MODE` en Android Studio: la selección queda registrada por el último sync correcto.

## Protección de preparación

Cada intento de sync invalida primero `.firebase/android-staging-prepared.json` (local e ignorado por Git). Solo se escribe de nuevo tras verificar configuración, manifiesto Staging, hashes de origen y copia Android. Los archivos adicionales se rechazan salvo los generados por Cordova. El registro incluye hashes de todos los assets Android, incluidos configuración y registro de plugins.

Antes de cada build Android, `verifyFirebaseEnvironment` ejecuta el verificador Node. Rechaza preparación ausente/incompleta, mezcla de modos, proyecto equivocado, archivos cambiados o sobrantes y un nuevo build web no sincronizado. La última modalidad preparada correctamente permanece seleccionada hasta ejecutar el otro comando; un build posterior no cambia de modalidad implícitamente. Si falla el control, repetir build web si corresponde y el sync elegido; no editar el registro. Node debe estar disponible en el PATH de Android Studio (reiniciar Studio si cambió el PATH).

## Build e instalación en Android Studio (usuario)

1. Ejecutar el build web y uno de los dos comandos anteriores. Esperar el mensaje `Android Staging prepared: remote/embedded`.
2. Abrir la carpeta `C:\Mario\FertiliAPP\FertiliAPP\android` como proyecto en Android Studio. Dejar terminar su sincronización Gradle. Usar JDK 21, SDK 36 y la toolchain fijada por AND-01 (ver requisitos al final); no aceptar actualizaciones automáticas adicionales.
3. Elegir el módulo `app` y la variante `debug` en Build Variants. Para obtener el archivo, usar Build > Build Bundle(s) / APK(s) > Build APK(s) (el nombre puede variar según versión). Salida: `android\app\build\outputs\apk\debug\app-debug.apk`.
4. Para instalar desde Studio, conectar el teléfono con depuración USB, aceptar la autorización, elegirlo como dispositivo y pulsar Run con la configuración `app`. Studio compila e instala la variante debug sobre la app Staging existente si la firma es compatible.
5. No desinstalar ni borrar almacenamiento para cambiar de modalidad: puede haber temperaturas pendientes. Si aparece conflicto de firma, detenerse y resolverlo antes de borrar datos. El usuario ha compilado/instalado la APK y confirma que AND-03 funciona correctamente. Las comprobaciones complementarias indicadas abajo no se consideran realizadas individualmente sin evidencia específica.

## AND-03: comportamiento del origen local

- La detección exige plataforma nativa Android de Capacitor **y** origen exacto `http://localhost` o `https://localhost`. El proyecto actual usa HTTP. Un navegador en localhost sigue siendo web; Android en Hosting sigue siendo remoto. Cambiar el host/esquema configurado exige revisar esta detección y el almacenamiento por origen.
- La APK incorporada espera `authPersistenceReady` y `auth.authStateReady()` antes de escuchar el usuario inicial. Con usuario persistido entra directamente; sin usuario muestra el login habitual, sin error de cookie ausente. Si la inicialización falla o supera el plazo de seguridad existente (12 s), permite reintentar; no intenta restauración web. No se ha demostrado un fallo de persistencia en el dispositivo.
- No llama a `/api/sessionRestore`, `/api/sessionLogin` ni `/api/sessionLogout`. Mantiene Firebase Auth con IndexedDB y alternativa localStorage ya existentes. El logout conserva la marca local de cierre explícito, invalida logins pendientes y espera el cierre SDK; devuelve `localCleared: true, backendCleared: false`, sin afirmar que borra cookies web. Un login explícito correcto retira la marca local. Las cookies del origen remoto permanecen independientes.
- Web/PWA y APK remota conservan sus rutas `/api`, cookies, plazos y protecciones. No se han modificado Functions, CORS, cookies, reglas, Firebase de producción, Analytics ni la configuración Gradle 9.
- React Router y las llamadas SDK a Firebase de Staging no cambian. Analytics sigue desactivado en Staging.

### Enlaces de correo

Registro, reenvío y recuperación usan `https://fertiliapp-staging.web.app/auth` como URL de continuación; el cambio de correo usa `/settings` en ese mismo dominio. Web conserva su origen actual. No se añaden App Links ni retorno automático a Android.

El enlace de Firebase se completa en el navegador, usando el manejador existente `/auth/action` (`AuthActionPage.jsx`). La URL de continuación no configura por sí sola ese manejador: **pendiente verificar en Firebase Console de fertiliapp-staging** que el dominio `fertiliapp-staging.web.app` está autorizado en Authentication y que las plantillas de verificación, recuperación y cambio de correo apuntan al manejador HTTPS `/auth/action`. También debe estar publicada en Hosting la ruta existente. No se ha consultado ni cambiado esa configuración externa, ni desplegado nada.

Al regresar a la APK se recarga el usuario Firebase en los eventos de visibilidad/pageshow; si no se emiten en el dispositivo, Ajustes ya ofrece la comprobación manual del correo (`refreshCurrentUser`). Un fallo de red no descarta el usuario local. Después de cambiar contraseña/correo puede requerirse iniciar sesión otra vez según la invalidación de tokens del SDK. Validar los enlaces reales y códigos caducados en Staging.

### Almacenamiento y cambio de modalidad

Auth y Firestore mantienen su persistencia existente. Las preferencias Firestore se cargan por UID; respuestas tardías de otra cuenta se descartan. La revisión BLE se conserva en localStorage bajo `fertiliapp:ble-review:v1:<uid>` y convierte guardados interrumpidos en estado incierto al recuperarlos. La cola nativa también se consulta por cuenta. No se modifica ni borra ninguno de estos registros.

Una actualización normal con el mismo identificador, firma y origen debe conservar el almacenamiento; debe comprobarse físicamente. Si IndexedDB/localStorage no están disponibles, no se puede prometer persistencia entre aperturas: no se sustituye por cookies ni se borra almacenamiento para recuperarlo. El almacenamiento remoto y el incorporado son distintos. No se copian datos automáticamente entre ellos, ni se garantiza que pendientes de uno aparezcan en el otro.

Antes de cambiar modalidad, con conexión y la cuenta correcta:

1. Volver al primer plano y revisar Dispositivos/termómetro y todas las temperaturas pendientes; permitir recuperar la cola nativa antes de darla por vacía.
2. Resolver cada pendiente mediante el flujo existente. Si un guardado es incierto, comprobar primero el día en Mis registros para no duplicarlo. No descartar lecturas para acelerar el cambio.
3. Esperar las confirmaciones de guardado y resolver los avisos de error/resultado incierto. Comprobar los registros sincronizados desde Staging en otro navegador; esto confirma esos registros, no prueba por sí solo que no haya ninguna escritura pendiente.
4. Si queda algún pendiente, borrador o resultado sin confirmar, permanecer en la modalidad actual. No hay una comprobación global nueva que certifique todas las colas. Revisar también las otras cuentas usadas en esa instalación antes de cambiar.

### Service worker y actualizaciones

Solo en APK incorporada se omiten registro, comprobaciones por navegación, aviso PWA y recargas por actualizaciones/preload. Las nuevas interfaces llegan instalando otra APK. Un registro anterior se cancela únicamente si tiene scope raíz y script `/sw.js` del mismo origen local. No se eliminan Cache Storage, IndexedDB ni preferencias, ni se fuerza una recarga.

Un worker ya activo puede controlar la WebView hasta cerrarla completamente. Tras la primera apertura de esta revisión, cerrar y volver a abrir para comprobar que ya no hay controlador/registro local. Si el worker antiguo sirve una versión que todavía no contiene esta retirada, documentar la versión/controlador observado antes de intervenir; no borrar los datos de la app. Web/PWA y APK remota mantienen sus actualizaciones habituales.

### Validación física complementaria de AND-03

Funcionamiento de AND-03 confirmado por el usuario en su APK. Conservar esta referencia; la siguiente matriz recoge casos específicos para futuras regresiones y extremos no desglosados en esa confirmación.

- Arranque sin sesión: login habitual sin «No hemos podido recuperar tu sesión» ni tráfico `/api/session*`.
- Login, cerrar y reabrir; repetir cierre rápido y actualización de APK con la misma firma: recuperar usuario y datos sin login innecesario.
- Logout y reapertura inmediata: no recuperar usuario. Login de otra cuenta: no mostrar preferencias, caché ni pendientes de la anterior; al volver a la primera, conservar sus pendientes.
- Registro/reenvío, recuperación de contraseña y cambio de correo: enlaces HTTPS Staging, completarlos en navegador y volver a la APK/comprobar usuario en Ajustes. Probar enlace caducado.
- Conservar temperaturas pendientes y estados inciertos tras cierre/actualización, sin nuevos guardados ni duplicados. Mantener las pruebas BLE existentes separadas.
- Confirmar retirada limitada del worker antiguo, ausencia de aviso de actualización web y de recargas continuas; navegar entre rutas y volver del navegador.
- Repetir login/logout/restauración y actualización web en PWA/APK remota, solo tras comprobar ausencia de pendientes antes de cambiar modalidad.

Codex ejecuta únicamente pruebas JavaScript de autenticación, configuración/aislamiento, acciones de correo y actualizaciones, más `git diff --check`. No se ha ejecutado build, sync, Gradle, instalación ni despliegue para AND-03. Las pruebas usan adaptadores en memoria; no certifican persistencia real del WebView ni configuración de Firebase Console.

## AND-04: consulta sin conexión e icono Staging

Solo en la APK incorporada, la carga de ciclos reutiliza `cycleCache` (IndexedDB/localStorage por UID). Con sesión persistida, permite consultar los ciclos/registros guardados y muestra un aviso discreto de datos almacenados que podrían no estar actualizados. Las preferencias necesarias para interpretar el ciclo siguen pasando por su protección existente: si faltan, no se inventan valores para desbloquear la interpretación. Auth de AND-03 no cambia.

Sin caché de ciclos utilizable se muestra un mensaje con Reintentar, no un ciclo vacío supuesto. Una cuenta realmente vacía solo se muestra como tal tras una lectura confirmada por Firebase. Cada espera de caché/servidor tiene un límite de 12 s; si ambas se bloquean sucesivamente, el arranque sin datos puede tardar hasta unos 24 s en ofrecer el reintento. Ajustes, logout y dispositivos siguen accesibles sin ciclos.

En Android incorporado, AND-04B usa el estado nativo de Network como fuente de conectividad; `navigator.onLine` queda como respaldo inicial si todavía no hay respuesta nativa. Si hay red disponible pero Firebase falla, se muestra que no se pudo actualizar desde Firebase, manteniendo los datos previos. No se presenta el indicador del navegador como prueba de disponibilidad del servidor. Al recuperar conexión se refresca solo la cuenta actual; las solicitudes simultáneas se agrupan. Tras un timeout se conserva la referencia a la petición SDK pendiente para que un reintento no duplique esa lectura. Las respuestas de una carga descartada por cambio de cuenta no se aplican ni se guardan para la otra cuenta.

Las lecturas de actualización de ciclos incorporados requieren respuesta de servidor sin `fromCache` ni `hasPendingWrites`. Las consultas web/PWA/remotas conservan el comportamiento previo del SDK. No se borran cachés al cambiar cuenta en la modalidad incorporada ni se copian datos entre orígenes. No se añade almacenamiento ni se modifica `cycleCache`.

### Guardados y límites

- Con desconexión conocida, las operaciones manuales de ciclos/registros (crear, editar, borrar y ajustes del ciclo) se rechazan antes de llamar a Firebase. El error indica que esa operación no se ha enviado. Consultar datos locales no garantiza que se puedan editar: una lectura parcial de temperaturas conserva la protección existente.
- No se alteran las transacciones, incorporación BLE ni detección de duplicados. Las transacciones necesitan acceso a Firebase y no se convierten en una cola offline.
- Si se pierde la conexión **después** de enviar una escritura, un batch/operación SDK puede seguir pendiente y confirmarse más tarde, o fallar. Se mantiene la espera/gestión de error existente; no se inventa un éxito, un timeout de escritura ni un reintento automático. No volver a enviar una operación incierta sin comprobar primero los registros. Los formularios pueden seguir esperando una confirmación; no existe un gestor global nuevo de escrituras.
- La reconexión añadida ejecuta solo lecturas, nunca repite guardados. Preferencias/cuenta mantienen sus operaciones existentes y requieren su propia confirmación Firebase. No se promete crear cuentas, recuperar contraseñas ni enviar/verificar correo sin Internet.

### Icono Android

`resources/icon-staging.png` es el original proporcionado por el usuario. `scripts/generate-staging-icons.mjs` genera 18 PNG con nombres `ic_launcher_staging`, `ic_launcher_staging_round` e `ic_launcher_staging_foreground` en ldpi/mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi, y dos XML adaptativos en `mipmap-anydpi-v26`. Se usan márgenes sobre fondo blanco: el distintivo amarillo queda dentro del círculo seguro del adaptativo y del recorte redondo. Se han comprobado píxeles y vistas redonda/adaptativa; falta confirmar el launcher real.

Gradle selecciona los recursos Staging mediante los placeholders del manifest para ambas modalidades, manteniendo `FertiliApp Pruebas` y `com.fertiliapp.fertiliapp.staging`. Producción sigue apuntando a `ic_launcher`/`ic_launcher_round`; esos recursos, `resources/icon.png` y los iconos PWA/Experiment no se modifican. La corrección `providers.exec` de Gradle 9 se conserva. No se añaden flavors ni dependencias. Para regenerar solo las imágenes: `node scripts/generate-staging-icons.mjs` (usa sharp ya instalado).

### Preparación y pruebas físicas de AND-04 (usuario)

```powershell
npm run build:staging
npm run sync:staging:android:embedded
```

Después abrir `android` en Android Studio, elegir `app`/`debug` y Run sobre el teléfono; para generar el archivo, Build APK(s). Conservar firma/identificador y datos. No se han ejecutado estos pasos en Codex.

1. Con sesión y datos descargados, cerrar la APK, activar modo avión y abrir: consultar ciclo actual, archivados y registros, con aviso de datos almacenados y sin restauraciones web.
2. Probar una cuenta de test sin caché local (sin borrar almacenamiento de la cuenta habitual): mensaje claro, acceso a Ajustes y Reintentar; nunca un ciclo vacío supuesto ni carga indefinida. Si faltan preferencias, comprobar también su mensaje existente.
3. Perder conexión mientras se consulta: conservar datos. Volver a conectar/reintentar varias veces: refrescar sin cargas simultáneas ni escrituras nuevas. Probar conexión aparente con Firebase inaccesible.
4. Cambiar cuenta durante una carga lenta: no mostrar datos de la anterior; volver a la primera y conservar su caché y temperaturas pendientes.
5. Intentar un guardado manual ya offline: no enviado/sin éxito. Perder red después de enviar: esperar confirmación o revisar resultado incierto, reconectar y comprobar que no se repite la operación. No usar datos reales para pruebas destructivas.
6. Comprobar icono amarillo, nombre e identificador en launcher redondo/adaptativo, tanto incorporado como remoto. Confirmar que producción conserva su icono original y que las PWA no cambian.

Pruebas de código dirigidas: `node --test scripts/embedded-offline.test.mjs scripts/staging-icons.test.mjs scripts/temperature-persistence.test.mjs scripts/preferences-gate.test.mjs scripts/auth-recovery.test.mjs scripts/staging-android.test.mjs`. No sustituyen la validación física offline, de escrituras pendientes ni del launcher.

## AND-04B: conectividad nativa y pruebas de Staging

Implementado sobre `nov26` / `505b7b0c`, sin commit, merge ni despliegue. La prueba física detectó que `navigator.onLine` y los eventos web no reflejaban de forma fiable modo avión/reconexión. Se añade únicamente el plugin oficial **@capacitor/network 8.0.1**, fijado en package.json/lockfile, compatible con core >= 8.0.0. [API oficial Network v8](https://capacitorjs.com/docs/apis/network). El código Android instalado utiliza ConnectivityManager y comprueba capacidades INTERNET/VALIDATED; eso no prueba por sí solo que Firebase responda.

### Funcionamiento y alcance

- Solo el efecto de la **APK Android incorporada y con sesión** registra Network.networkStatusChange y consulta Network.getStatus. Web, PWA y APK remota mantienen sus cargas y protecciones anteriores; no se suscriben a los plugins desde este flujo.
- `embeddedConnectivity.js` es un adaptador de esos eventos oficiales, sin sondas propias ni temporizadores periódicos. Registra antes de consultar, descarta respuestas getStatus anteriores a un evento más reciente y agrupa comprobaciones simultáneas. Comprueba de nuevo al volver mediante App.appStateChange; visibilitychange sirve también de respaldo. Los eventos web solicitan un estado nativo, no reemplazan una señal nativa por navigator.onLine.
- Al perder red, el mismo cargador publica desconexión y conserva los datos. El nuevo metadato `needsServerConfirmation` mantiene el aviso durante la reconexión hasta confirmar un snapshot válido de Firebase; disponer de Wi-Fi no lo elimina. Si Firebase falla o expira la espera, se conserva el aviso y la caché. Una carga inicial normal desde caché no activa este metadato ni serverReadFailed.
- Al recuperar red se llama al cargador existente. Eventos repetidos reutilizan la carga/consulta SDK pendiente. Si la recuperación coincide con una carga offline o una lectura de la red anterior que falla, se permite un único intento posterior por esa transición, sin lecturas paralelas ni bucle de reintentos. Una confirmación nativa inicial tardía no repite una lectura ya confirmada.
- Los listeners pertenecen a la sesión del contexto: se retiran individualmente al desmontar/cambiar cuenta/salir, incluso si el registro asíncrono termina después. Se descartan callbacks y lecturas de la sesión anterior. No se usa removeAllListeners ni se altera la escucha BLE.
- Las comprobaciones preventivas de guardado existentes consultan el mismo estado nativo, incluso si navigator.onLine sigue en true. No cambian las operaciones transaccionales, la persistencia ni sus resultados. Una escritura enviada continúa con su resolución/rechazo original; desconexión/reconexión no la repite ni convierte un resultado incierto en éxito.
- No cambia el diseño: MainLayout solo reconoce el metadato de confirmación y explica «Comprobando actualización desde Firebase» durante esa espera. Se conservan las ubicaciones y limitaciones visuales documentadas en AND-05A, incluido que Registros/gráfica no tienen icono compacto. Sin datos, mensaje visible.

### GitHub Actions y comprobaciones

Revisado el [run 45904986020](https://github.com/Orzobi0/RNF-App/actions/runs/45904986020): diez errores `CycleAvailabilityIndicator is not defined` en test:staging; build y despliegue se omitieron. Los dos fixtures que cargan DevicesPage en `femometer-shared.test.mjs` ahora inyectan `CycleAvailabilityIndicator: () => null`. No se modificaron componentes de Dispositivos ni lógica BLE para corregirlos; se conservan todas las aserciones.

- `node --test scripts/embedded-network.test.mjs scripts/embedded-offline.test.mjs scripts/android-layout.test.mjs`: **41/41**.
- `npm run test:staging`: **200/200**, incluidas las diez antes fallidas.
- `npm run check:staging` y `git diff --check`: correctos.

Cobertura con adaptadores en memoria: modo avión con navigator obsoleto, recuperación Wi-Fi, Firebase inaccesible, caché inicial sin falso aviso, retorno al primer plano, respuestas nativas antiguas, limpieza de registros tardíos, cambio de cuenta en reconexión, eventos repetidos y escrituras pendientes con resolución/rechazo sin reenvío. No se ejecutaron builds web, Capacitor sync, Gradle, emuladores, instalaciones ni despliegues. El run remoto no se ha relanzado: el resultado 200/200 corresponde a la ejecución local de su comando.

### Preparación y validación pendiente en teléfono

El plugin aún debe incorporarse a una APK nueva: añadir la dependencia JS no registra por sí solo el plugin en una APK ya instalada. Su manifest declara ACCESS_NETWORK_STATE, que se fusionará durante la preparación/compilación; no se han editado archivos generados ni el manifest de la aplicación. Una APK vieja sin Network no puede ofrecer estas garantías; se registra el fallo del puente y se conserva el respaldo inicial web. Una pérdida transitoria de acceso al puente no borra el último estado nativo conocido.

Comandos **solo para el usuario**, con Java 21 y SDK 36 ya configurados:

```powershell
npm ci
npm run build:staging
npm run sync:staging:android:embedded
.\android\gradlew.bat -p android assembleDebug
adb install -r .\android\app\build\outputs\apk\debug\app-debug.apk
```

Conservar firma y almacenamiento. Comprobar en la APK incorporada: arranque con caché y Wi-Fi sin aviso transitorio; modo avión con app abierta; Wi-Fi recuperado sin Reintentar; red disponible con Firebase inaccesible; segundo plano/cambio de red/retorno; logout y cambio de cuenta durante consulta; repetición rápida de eventos; escrituras ya enviadas sin duplicados y nuevos guardados bloqueados offline. Repetir sin caché y verificar el mensaje visible. La respuesta llega cuando Android emite el estado o responde a getStatus; no se promete latencia cero ni acceso a Firebase solo porque connected sea true. AND-04 continúa abierto hasta esta validación física.

## AND-01: actualización controlada de plataforma

Estado: preparación de código sobre `nov26`, commit base `6c8c88ae`. **APK incorporada compilada e instalada por el usuario, con sesión/ciclos/registros confirmados; falta completar validación física y AND-01 no está terminado.** No se ejecutaron builds web, Capacitor sync/migrate, Gradle, Android Studio, emuladores ni despliegues. Los recursos Staging sin seguimiento presentes al comenzar se han conservado.

### Versiones y requisitos locales

| Componente | Antes | Preparado |
| --- | --- | --- |
| Capacitor core / android / cli | 5.7.8 | 8.6.3 estable, fijado exacto |
| Capacitor App | 5.0.8 | 8.1.2 estable, fijado exacto |
| compileSdk / targetSdk | 34 / 34 | 36 / 36 |
| minSdk | 26 | 26 (Android 8+) |
| Gradle wrapper | 9.2.0 | 8.14.3 |
| Android Gradle Plugin | 8.13.2 | 8.13.2 conservado |
| Google Services plugin | 4.3.15 | 4.4.4 |
| Compatibilidad Java | 17 | 21 |

Node **22 o superior** (pruebas con 22.13.1), JDK **21** tanto en JAVA_HOME como en Gradle JDK de Studio; Android Studio **Otter 2025.2.1 o posterior compatible con AGP 8.13.2**. Instalar Android SDK Platform 36, SDK Build-Tools 35.0.0 (predeterminado de AGP 8.13) y Platform-Tools. No se fija una ruta personal de JDK/SDK en Git. `android/gradle.properties` mantiene AndroidX y memoria existentes; no requiere flags adicionales. No hace falta añadir Kotlin ni NDK al código Java propio.

AndroidX y Cordova se alinean con los valores del paquete instalado `@capacitor/android` 8.6.3 en `android/variables.gradle`. Gradle vuelve a la línea recomendada 8.14.3, manteniendo el parche AGP 8.13.2 existente. La llamada `providers.exec(...).result.get().assertNormalExitValue()` sigue siendo válida y se conserva: el fallo del verificador sigue abortando preBuild. No se vuelve a `Project.exec`.

React y sus dependencias directas ajenas a Android permanecen iguales. El lock actualiza Capacitor y su árbol transitivo; `@capacitor/assets` sigue en 3.0.5 y conserva su CLI 5 privado como dependencia de desarrollo. Los scripts de sync invocan expresamente el CLI 8 de la raíz. No utilizar la herramienta de assets para migrar Android. npm advierte sobre tar/glob antiguos de ese árbol; no se ha realizado un `audit fix` general.

### Revisión de compatibilidad

Fuentes oficiales revisadas: [5 → 6](https://capacitorjs.com/docs/updating/6-0), [6 → 7](https://capacitorjs.com/docs/updating/7-0), [7 → 8](https://capacitorjs.com/docs/updating/8-0), [8.5, cambios de ciclo de vida iOS](https://capacitorjs.com/docs/updating/8-5), [AGP 8.13](https://developer.android.com/build/releases/agp-8-13-0-release-notes), [Android 16 con target 36](https://developer.android.com/about/versions/16/behavior-changes-16) y [Android 16 para todas las apps](https://developer.android.com/about/versions/16/behavior-changes-all). Contrastadas con el código de los paquetes npm instalados, sin ejecutar migradores.

- **Origen y datos:** se fija `server.androidScheme: 'http'` y, en incorporado, `hostname: 'localhost'`. El cambio predeterminado a HTTPS desde Capacitor 6 separaría el almacenamiento de la instalación anterior. `cleartext: false` y los destinos remotos HTTPS se conservan. El verificador rechaza esquemas ausentes/distintos y hosts locales distintos, incluso si los hashes coinciden. Una preparación anterior se debe repetir con el nuevo CLI; no editar los assets para eludirlo.
- **MainActivity:** sin modificaciones. `registerPlugin(FemometerBle.class)` antes de `super.onCreate` sigue admitido por BridgeActivity 8; su PluginManager también carga App desde el registro generado. `onStart/onStop` conservan las llamadas a super y al propietario GATT. No se usa el recurso eliminado `bridge_layout_main`. La incidencia física BLE-11 no se considera resuelta solo por actualizar versiones.
- **FemometerBle/GATT/servicio:** sin cambios. Se conservan PluginCall, JSObject, permisos por alias, PermissionCallback, notifyListeners y handleOnDestroy presentes en Capacitor 8. El servicio `connectedDevice` arranca con actividad visible y permisos BLE, usa PendingIntent inmutable y START_NOT_STICKY. El receptor solo escucha el broadcast protegido del sistema Bluetooth. No se añaden permisos de salud ni se alteran ventanas, reintentos, GATT, cola, automatización BLE-12 o diagnóstico BLE-13. Las cuotas nuevas de JobScheduler no sustituyen este servicio, que no usa JobScheduler/WorkManager; no garantizan su supervivencia ante restricciones del fabricante.
- **Registro y sincronización:** App continúa como proyecto Gradle y plugin generado; los listeners BLE usan `await`. Los archivos generados ignorados de Cordova y assets todavía pueden reflejar Capacitor 5: el sync explícito del usuario los actualizará. Se ajustó manualmente Java 21 en el archivo versionado `app/capacitor.build.gradle`, coincidiendo con lo que genera CLI 8; no se regeneró Android.
- **Manifest:** se añaden `navigation|density` a configChanges para evitar recreaciones innecesarias. Permisos, identificadores, placeholders de iconos, proveedor y servicio permanecen iguales.
- **Health Connect:** no se encuentran plugins, dependencias Android ni permisos de Health Connect en el árbol revisado. La Function `syncBasalBodyTemperature` y campos `health_connect` siguen en backend. Su retirada requiere comprobar consumidores y despliegues (AND-06). BLE Health Thermometer se conserva íntegro.

### Riesgos visuales y de sistema pendientes

Android 16 con target 36 impone edge-to-edge. Capacitor 8 usa SystemBars; el código instalado inyecta variables `--safe-area-inset-*`. La interfaz actual usa también `env(safe-area-inset-*)` y el puente propio de color de barra de MainActivity, cuya API de color ya no garantiza el resultado anterior. **Pendiente adaptar y verificar safe areas, cabecera, barra inferior, iconos claros/oscuros y teclado en AND-05**; no se ha refactorizado la UI ni añadido un opt-out de edge-to-edge.

Atrás predictivo deja de entregar el antiguo onBackPressed en Android 16. App 8.1.2 utiliza OnBackPressedDispatcher/OnBackPressedCallback, por lo que no se añade un opt-out temporal. Aun así, hay que probar el historial WebView/React Router, `useBackClose`, diálogos anidados, raíz y regreso del navegador. Probar rotación, multiventana y pantallas grandes: Android 16 puede ignorar restricciones de tamaño/orientación. No asumir que las comprobaciones estáticas validan estos comportamientos.

### Preparar la APK incorporada de Staging (solo usuario)

Desde la raíz, con JDK 21 configurado y Node en PATH:

```powershell
npm ci
$env:CAPACITOR_ENV = 'staging'
Remove-Item Env:CAPACITOR_STAGING_MODE -ErrorAction SilentlyContinue
npm run check:staging
npm run build:staging
npm run sync:staging:android:embedded
node scripts/check-staging-android.mjs
Push-Location android
.\gradlew.bat testDebugUnitTest assembleDebug
Pop-Location
```

No continuar tras un comando fallido. El sync debe indicar `Android Staging prepared: embedded`. Alternativamente, tras ese sync abrir `android` en Studio, seleccionar Gradle JDK 21 y app/debug, ejecutar las pruebas nativas y Build APK(s). APK: `android/app/build/outputs/apk/debug/app-debug.apk`. No borrar almacenamiento ni desinstalar para resolver errores de firma. Mantener mismo identificador y firma al actualizar. Para remoto, usar `npm run sync:staging:android:remote` después de resolver los pendientes de todas las cuentas; no publica el frontend remoto.

### Validación necesaria para cerrar AND-01

1. Compilar con la toolchain indicada y ejecutar pruebas nativas; comprobar que una preparación ausente, alterada o de otro entorno bloquea el empaquetado. Revisar manifest fusionado, registro App/FemometerBle, nombre/icono Staging e identificadores de ambas variantes de entorno.
2. Actualizar sobre APK incorporada anterior con la misma firma: sesión, IndexedDB, preferencias, ciclos y temperaturas pendientes conservados en `http://localhost`. Probar cierre/reapertura, logout, cambio de cuenta y guardados inciertos sin duplicados. Repetir la matriz AND-03/04, modo avión con/sin caché y reconexión sin nuevas escrituras.
3. En teléfono Android 16 y al menos una versión anterior (incluido API 26 si disponible), conceder/denegar/revocar permisos Bluetooth, apagar/encender Bluetooth, conectar Vinca 2 y recibir lecturas. Bloquear pantalla, recibir y recuperar cola; volver antes y después del vencimiento existente de seis minutos. Comprobar notificación/servicio, desconexión y ausencia de reinicios de una conexión sana.
4. Validar BLE-12 (incorporación y duplicados), BLE-13 (diagnóstico sin tráfico adicional), cambios de cuenta/dispositivo y cola pendiente tras reinicio/actualización. Comprobar carga real de App y eventos de ciclo de vida para BLE-11.
5. Revisar barras, safe areas, teclado, Atrás y diálogos, escalado y orientación. Verificar ambas modalidades, Firebase exclusivamente Staging, y que producción conserva recursos e identificador; no desplegar ni usar datos reales para pruebas destructivas.

Pruebas de código: `node --test scripts/android-platform.test.mjs scripts/staging-android.test.mjs scripts/staging-isolation.test.mjs scripts/auth-recovery.test.mjs scripts/embedded-offline.test.mjs scripts/staging-icons.test.mjs scripts/android-ui.test.mjs scripts/femometer-bridge.test.mjs scripts/femometer-shared.test.mjs scripts/ble-measurements.test.mjs scripts/ble-manual-import.test.mjs scripts/temperature-persistence.test.mjs scripts/preferences-gate.test.mjs`, `npm run check:staging` y `git diff --check`. Las pruebas JavaScript y de fixtures no acreditan compilación ni comportamiento físico.

Resultado final: **513/520 pruebas pasan; quedan 7 fallos reproducidos también con los archivos del commit base**: seis en `android-ui.test.mjs` (reloj, cambio de cuenta, sesión automática, parada durante conexión y búsqueda manual) y uno en `ble-measurements.test.mjs` (confianza temporal Vinca antes de sincronización redundante). No se cambia comportamiento BLE para ocultarlos. La comprobación nueva de plataforma y los seis casos de Staging Android pasan (7/7); `check:staging` y `git diff --check` pasan. La comparación base usa los tests y fuentes extraídos de `6c8c88ae`, con las dependencias locales actuales; no es una compilación ni una instalación independiente del lock antiguo.


## AND-05A: interfaz Android 16 y estado offline

Implementado en `nov26`, sin commit, merge, despliegue ni compilación en Codex. Se revisaron SettingsPage y el DevicePageShell compartido por Dispositivos/Vinca 2: sus cabeceras sticky conservan dimensiones y `top-0`; el área de scroll empieza ahora después del inset superior en Android. No se modificó lógica de ciclos, BLE, caché, red, escrituras ni Firebase.

- Eliminada la franja «Entorno de pruebas», sin sustitución ni hueco. Restaurado `setTextZoom(100)` para Staging y producción por igual: su retirada amplificaba números/textos con la escala de fuente Android. No se retocan tipografías individuales. Implicación de accesibilidad: el texto WebView ya no sigue el aumento de fuente del sistema; comprobar lectura con TalkBack y ampliación de pantalla. Web/PWA/iPhone no usan este ajuste. Iconos, nombre APK e identificadores intactos.
- API integrada `SystemBars` verificada contra el código instalado de Capacitor **8.6.3** (`plugin/SystemBars.java`, exportaciones de core y tipos): `LIGHT` = iconos oscuros, incluso con tema Android oscuro. Configuración `insetsHandling: css` e `initialViewportFitValueHint: cover`, coincidiendo con el viewport HTML. Referencia: [System Bars oficial](https://next.capacitorjs.com/docs/apis/system-bars); el código instalado es la referencia de compatibilidad, no las opciones de versiones futuras.
- En Android, `/settings` y sus descendientes usan `#F8FAFC`; dashboard, registros y ciclos usan `#FFF7F9`, igual que sus fondos efectivos (se elimina la franja `#FFE4E6`). La gráfica cargada usa realmente `#FFF8FA` en ChartPage/FertilityChart: ChartPage pasa ese mismo `baseStyle.backgroundColor` a MainLayout, sin aproximarlo; sus estados de carga/sin ciclo conservan el fondo general. Se pinta la superficie de la aplicación detrás de la barra transparente y se actualiza antes del repintado React, sin reset rosa al desmontar. SystemBars controla contraste/insets; `FertiliAppStatusBar` queda limitado a pintar el fondo nativo para WebViews antiguas y la barra opaca en API < 35. Se reaplica al volver y tras cambios de configuración. No hay dos escritores de contraste.
- WebView >= 140 con viewport cover recibe insets efectivos. En WebViews anteriores, SystemBars reserva espacio nativo y publica ceros: CSS no vuelve a sumarlo. Android toma `var(--safe-area-inset-*, env(...))`, nunca la suma; reserva superior una sola vez en el contenedor exterior, mantiene scroll acotado al viewport y usa safe bottom completo, sin el límite iOS de 34 px. Se recalcula `--bottom-nav-safe` en ese mismo ámbito. El teclado sigue el manejo IME de SystemBars y el ViewportHeightFix existente, sin listeners nuevos de teclado.
- Corregido el falso WifiOff del arranque: `embeddedCycleLoader` añade únicamente `serverReadFailed` a su estado publicado. Empieza en falso, se activa al fallar/expirar la consulta de servidor y se borra al confirmar un snapshot válido. No cambia fases, consultas, persistencia, concurrencia, timeouts ni reintentos. Recuperar caché durante la consulta no es un fallo. Un fallo previo se conserva durante Reintentar hasta confirmar datos; `knownOffline` sigue siendo el indicador de desconexión conocida.
- BottomNav restaurado exactamente al componente original: cinco iconos, cinco columnas, mismas alturas/espacios/tamaños. WifiOff sale de su cuadrícula y de ChartControls. Se conserva diálogo Radix accesible y Reintentar. El botón de 32 px ocupa espacios superiores en el flujo, sin fila nueva: celda lateral vacía de 48×32 en dashboard; cabecera de archivo, Ajustes, Dispositivos/Termómetro, Preferencias y Soporte. Las cabeceras textuales de Ajustes conservan líneas truncadas y su altura; no se coloca un botón flotante sobre ellas. Sin datos se mantiene el aviso visible del layout.
- **Incompatibilidades explícitas:** Registros (actual y archivado) tiene acciones absolutas a ambos lados y navegación de ciclos; la gráfica normal/completa/rotada tiene controles y etiquetas superpuestos. No se ha identificado allí un hueco superior garantizado sin cambiar distribución o tapar controles, por lo que **no muestran el indicador compacto con datos**. Puede consultarse desde dashboard, Archivo o Ajustes; resolver esas dos cabeceras requiere acordar una posición de diseño. También los estados vacíos/de carga que no renderizan una cabecera no añaden una superposición. No se oculta el mensaje global cuando no hay datos.
- Barra horizontal de gráfica Android gris discreta; no se cambian overflow, gestos ni cálculos. Web/PWA/iPhone conservan reglas de dimensiones, insets y theme-color anteriores; la retirada de la franja Staging es deliberadamente común a todos.

### Comprobaciones realizadas

`node --test scripts/android-layout.test.mjs scripts/embedded-offline.test.mjs scripts/android-platform.test.mjs scripts/staging-android.test.mjs`: **35/35**. Incluyen render con adaptadores de componentes reales, acción Reintentar, rutas, contraste/restauración, navegación, parsing JSX/TS y CSS. `git diff --check` y `git diff --cached --check`: correctos. `check:staging` pasó en la revisión anterior; no se repitió en esta corrección. No se ejecutaron builds web, Capacitor sync, Gradle, Android Studio, emuladores ni despliegues. Las comprobaciones de CSS son estáticas: no certifican geometría ni aspecto en pantalla real.

### Validación física pendiente (AND-01 y AND-05 siguen abiertos)

1. Instalar sobre Staging existente y comparar con producción de esta revisión en el mismo dispositivo, orientación, escala de texto y estado de datos: mismas alturas, márgenes y cabeceras, sin franja. No basta comparar con una producción antigua.
2. Android 16 y una versión anterior soportada; WebView moderno y antiguo si es posible. Dashboard → Ajustes → Dispositivos → Vinca 2 → gráfica/registros/ciclos: iconos oscuros, rosa/gris correcto sin destellos ni franjas residuales. Repetir con tema oscuro del sistema, retorno del segundo plano y rotación.
3. Notch/cámara, orientación y escalado de texto: ninguna cabecera sticky bajo los iconos; navegación sobre gestos y navegación Android de tres botones; abrir/cerrar teclado en formularios sin recortes. Confirmar área inferior completa también si supera 34 px.
4. Modo avión con caché, Firebase inaccesible con red aparente y arranque sin caché: icono solo con datos; detalle, foco/lector de pantalla, cierre y Reintentar. Sin datos, aviso visible; no desbloquear escrituras. Confirmar cinco iconos idénticos en BottomNav en todos los estados, ningún WifiOff transitorio al arrancar con caché y Wi-Fi, y las posiciones superiores sin aumento de altura en pantallas estrechas.
5. Gráfica normal/completa/rotada: sin indicador superpuesto por la incompatibilidad indicada; desplazamiento horizontal y vertical intactos, barra gris y continuidad de color con el fondo real #FFF8FA. Revisar controles en los tamaños más pequeños.
6. Regresión visual en web/PWA y iPhone/Safari: mismas dimensiones y comportamiento, salvo retirada intencionada de la franja Staging. Las pruebas de código no sustituyen esta comparación.

### Generar e instalar la revisión (solo usuario)

Desde la raíz, con Java 21 configurado en `JAVA_HOME` (JBR 21 de Android Studio) y SDK 36 disponible:

```powershell
npm run build:staging
npm run sync:staging:android:embedded
.\android\gradlew.bat -p android assembleDebug
adb install -r .\android\app\build\outputs\apk\debug\app-debug.apk
```

Si `adb` no está en PATH, usar el ejecutable de `platform-tools` del SDK, o instalar con Run de Android Studio según la sección inicial. Conservar firma y almacenamiento; no desinstalar. Para esta prueba visual usar incorporado: el modo remoto seguirá mostrando el frontend publicado, y estos pasos no lo despliegan. No se continúan otras tareas Android; «Consultando vinculación…» queda pendiente de observación.


### «Consultando vinculación…»: revisión limitada y captura sin entrar en Dispositivos

No se ha demostrado una incompatibilidad de Capacitor 8.6.3/MainActivity. El código instalado de BridgeActivity añade los plugins registrados antes de `super.onCreate`, carga los automáticos y conserva la delegación del ciclo de vida. MainActivity mantiene registro FemometerBle, `super` y llamadas `activityVisible` de onStart/onStop. Los cambios visuales no sustituyen esos métodos. El flujo `search()` de femometerSession publica `checking`, espera `getRememberedFemometer`, publica `searching` y termina en `missing` si no hay una coincidencia única. Ese recorrido no acredita un fallo técnico ni explica por sí solo la pantalla bloqueada. No se modifica código BLE ni se propone recuperación automática.

Para recoger evidencia de la APK ya instalada, sin poder entrar en Termómetro:

1. Conectar el teléfono por USB, autorizar depuración y abrir **View > Tool Windows > Logcat** en Android Studio; seleccionar el dispositivo. No pulsar Run, reinstalar, borrar almacenamiento ni ejecutar sync/build para capturar.
2. Filtrar `package:com.fertiliapp.fertiliapp.staging level:DEBUG`. Iniciar captura antes de abrir la app desde su icono y mantenerla hasta reproducir el bloqueo. Guardar el intervalo completo con horas y PID; no limitar inicialmente a errores.
3. Para localizar eventos dentro de esa captura, usar `tag:FemometerBle` y buscar también `Capacitor`, `Registering FemometerBle`, `getRememberedDevice`, `scan`, `Scan blocked`, `BLE scan failed`, `UNIMPLEMENTED`, `PluginLoadException` y excepciones. Guardar además el tramo sin filtro de etiqueta: los errores del puente pueden tener otra etiqueta. Referencia de filtros: [Logcat oficial de Android Studio](https://developer.android.com/studio/debug/logcat).
4. Anotar hora de «Consultando vinculación…», primer arranque/retorno, APK exacta, Android/WebView, si el sistema tenía Bluetooth activo y los permisos visibles; no cambiarlos durante la captura. Adjuntar captura de la pantalla y secuencia temporal. Ocultar UID, correo, direcciones BLE, tokens y datos de salud antes de compartir registros.

Logcat permite recoger registros nativos sin abrir la pantalla de diagnóstico, pero no garantiza que todos los campos del snapshot BLE estén registrados. Si no hay eventos suficientes, conservar esa evidencia antes de ampliar instrumentación. La consulta nativa existente `getReceptionState(diagnosticOnly: true)` es de solo lectura y exige la cuenta autenticada; no sustituirla por llamadas de escaneo/reconexión ni por su variante sin `diagnosticOnly`, que sí puede comprobar vencimientos. La causa queda abierta; las observaciones actuales no justifican tocar GATT, permisos, tiempos ni recuperación.
