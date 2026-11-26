# Android Staging: remoto e incorporado

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
2. Abrir la carpeta `C:\Mario\FertiliAPP\FertiliAPP\android` como proyecto en Android Studio. Dejar terminar su sincronización Gradle. Usar el JDK ya configurado para este proyecto; no actualizar Gradle, SDK ni Capacitor.
3. Elegir el módulo `app` y la variante `debug` en Build Variants. Para obtener el archivo, usar Build > Build Bundle(s) / APK(s) > Build APK(s) (el nombre puede variar según versión). Salida: `android\app\build\outputs\apk\debug\app-debug.apk`.
4. Para instalar desde Studio, conectar el teléfono con depuración USB, aceptar la autorización, elegirlo como dispositivo y pulsar Run con la configuración `app`. Studio compila e instala la variante debug sobre la app Staging existente si la firma es compatible.
5. No desinstalar ni borrar almacenamiento para cambiar de modalidad: puede haber temperaturas pendientes. Si aparece conflicto de firma, detenerse y resolverlo antes de borrar datos. El usuario ya ha compilado e instalado AND-02A y confirmado login con correo/contraseña; la persistencia tras reabrir y los cambios AND-03 siguen pendientes de validación física.

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

### Validación física pendiente

- Arranque sin sesión: login habitual sin «No hemos podido recuperar tu sesión» ni tráfico `/api/session*`.
- Login, cerrar y reabrir; repetir cierre rápido y actualización de APK con la misma firma: recuperar usuario y datos sin login innecesario.
- Logout y reapertura inmediata: no recuperar usuario. Login de otra cuenta: no mostrar preferencias, caché ni pendientes de la anterior; al volver a la primera, conservar sus pendientes.
- Registro/reenvío, recuperación de contraseña y cambio de correo: enlaces HTTPS Staging, completarlos en navegador y volver a la APK/comprobar usuario en Ajustes. Probar enlace caducado.
- Conservar temperaturas pendientes y estados inciertos tras cierre/actualización, sin nuevos guardados ni duplicados. Mantener las pruebas BLE existentes separadas.
- Confirmar retirada limitada del worker antiguo, ausencia de aviso de actualización web y de recargas continuas; navegar entre rutas y volver del navegador.
- Repetir login/logout/restauración y actualización web en PWA/APK remota, solo tras comprobar ausencia de pendientes antes de cambiar modalidad.

Codex ejecuta únicamente pruebas JavaScript de autenticación, configuración/aislamiento, acciones de correo y actualizaciones, más `git diff --check`. No se ha ejecutado build, sync, Gradle, instalación ni despliegue para AND-03. Las pruebas usan adaptadores en memoria; no certifican persistencia real del WebView ni configuración de Firebase Console.
