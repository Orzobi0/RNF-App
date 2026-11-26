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
5. No desinstalar ni borrar almacenamiento para cambiar de modalidad: puede haber temperaturas pendientes. Si aparece conflicto de firma, detenerse y resolverlo antes de borrar datos. Comprobar el origen cargado y la modalidad preparada; el login/restauración incorporados no están validados todavía.

## AND-03: incompatibilidades identificadas, sin resolver aquí

- En Capacitor Android instalado (5.x), `CapConfig` usa por defecto `http://localhost`. Las llamadas relativas de `AuthContext.jsx` a `/api/sessionLogin`, `/api/sessionRestore` y las demás rutas de sesión van a ese origen, sin el rewrite `/api` de Firebase Hosting ni el proxy de Vite. No alcanzan la Function de sesión de Staging.
- Cambiar únicamente a una URL absoluta no resuelve el flujo: `fetch` usa credenciales y JSON; `functions/authSession.js` no implementa CORS/preflight para este origen y emite `__session` con `Secure; HttpOnly; SameSite=Lax`. El mecanismo actual depende del contexto de Hosting y debe revisarse para peticiones entre sitios en AND-03.
- `firebaseClient.js` ya solicita persistencia Auth en IndexedDB con alternativa localStorage, además de persistencia Firestore. Es almacenamiento por origen: la sesión, caché, preferencias y temperaturas pendientes web del Hosting no se transfieren automáticamente a localhost. Validar conservación entre aperturas, cierre de proceso, actualización y cambios de modalidad; no asumir pérdida ni migración automática de la cola nativa.
- Comprobar tiempos reales de arranque, recuperación de sesión y funcionamiento del service worker/caché desde el origen local. Incorporar React no garantiza autenticación sin red, disponibilidad de datos ni persistencia efectiva de IndexedDB en el dispositivo.

No se han modificado AuthContext, Auth, cookies, Functions, reglas ni mecanismos de autenticación. AND-03 queda pendiente.
