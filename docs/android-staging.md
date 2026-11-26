# Android Staging: remoto e incorporado

> AND-01 prepara una plataforma nueva, todavía sin compilación Android ni validación física. Las confirmaciones históricas de AND-03/04 no certifican esta migración.

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

`navigator.onLine === false` indica falta de conexión conocida. Si indica conexión pero Firebase falla, se muestra que no se pudo actualizar desde Firebase, manteniendo los datos previos. No se presenta el indicador del navegador como prueba de disponibilidad del servidor. Al recuperar conexión se refresca solo la cuenta actual; las solicitudes simultáneas se agrupan. Tras un timeout se conserva la referencia a la petición SDK pendiente para que un reintento no duplique esa lectura. Las respuestas de una carga descartada por cambio de cuenta no se aplican ni se guardan para la otra cuenta.

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

## AND-01: actualización controlada de plataforma

Estado: preparación de código sobre `nov26`, commit base `6c8c88ae`. **Pendientes compilación Android y validación física; AND-01 no está terminado.** No se ejecutaron builds web, Capacitor sync/migrate, Gradle, Android Studio, emuladores ni despliegues. Los recursos Staging sin seguimiento presentes al comenzar se han conservado.

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
