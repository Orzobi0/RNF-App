# Firebase staging: entorno operativo

Actualizado: 2026-09-09. Repositorio `Orzobi0/RNF-App`, rama `mayo_interpertacion`, base `b0d6ba2d`. Los cambios de código/configuración siguen locales, sin commit, push, merge ni ejecución de workflows.

**La web y su backend de sesiones están desplegados y validados en https://fertiliapp-staging.web.app.** Auth y Firestore pertenecen a `fertiliapp-staging` y son independientes de producción. Se han habilitado APIs y aplicado los permisos de staging autorizados por el usuario. Producción, sus datos y sus dominios solo se han consultado.

Para la rutina de ramas, commits, pruebas y PR, consultar [Desarrollo y publicación](desarrollo-y-publicacion.md).

## Direcciones y destinos

| Uso | Dirección / configuración | Backend |
| --- | --- | --- |
| Desarrollo local | `http://localhost:5174`, `npm run dev` | `fertiliapp-staging` |
| Pruebas publicadas / PWA | https://fertiliapp-staging.web.app | `fertiliapp-staging` |
| Experiment: validación opcional con backend real | https://experiment.fertiliapp.com | **`rnf-app`, producción** |
| Sitio Firebase de experiment | `rnf-app-experiment.web.app` | **`rnf-app`, producción** |
| Producción | sitio `rnf-app` y su dominio habitual | `rnf-app` |

La asociación de `experiment.fertiliapp.com` con `rnf-app-experiment` está activa, con certificado válido. También se inspeccionó su JavaScript publicado: contiene la configuración de `rnf-app` y el emisor `771820334247`. La web de staging contiene la configuración de `fertiliapp-staging`, sin ese emisor de producción.

No se ha movido `experiment.fertiliapp.com`, cambiado DNS en IONOS ni creado otro dominio personalizado. Staging y experiment **no están conectados como fases automáticas**. El usuario ha elegido conservar experiment con el backend de producción como validación opcional antes del merge.

## Aislamiento local y despliegues

- Proyecto de staging: `fertiliapp-staging`, número **574564111406**. Web app “Staging”: `1:574564111406:web:e49df0e56568b3a4f4fbbf`.
- Firebase CLI **15.5.1**, en `%APPDATA%/npm/firebase.cmd`. **El predeterminado sigue siendo `rnf-app`.**
- Staging usa `firebase.staging.json`, target Hosting `staging`, build `dist-staging` y variables ignoradas por Git en `environments/staging/.env.local`. Vite no carga el `.env` de producción desde esa configuración.
- Producción conserva `firebase.json`, target `production` y build `dist`. Compilación explícita: `npm run build:production`.
- Experiment conserva su target `experiment` en ese mismo archivo y usa el mismo build de producción. Los workflows de producción y experiment seleccionan únicamente su propio target de Hosting.
- Comando local de experiment: `npm run deploy:experiment:hosting`. Comprueba el proyecto `rnf-app` y su número `771820334247`, la pertenencia de `rnf-app-experiment` y la dependencia sessionApi, recompila en modo producción y despliega exclusivamente ese sitio con `firebase.experiment.json`. Este archivo no contiene Functions ni reglas. `npm run check:experiment` realiza las consultas de lectura y la compilación sin publicar.
- Los scripts de despliegue fijan `--project fertiliapp-staging`, comprueban también el número de proyecto y rechazan argumentos que cambien el destino.
- El hook de Hosting valida el proyecto, los hashes de todos los archivos y la ausencia de identificadores/URLs concretos de producción. Se verificó que rechaza un HTML alterado.
- La comprobación anterior a inicializar Firebase valida proyecto, appId, dominio Auth, emisor, bucket y origen Firebase Hosting. Auth, Firestore y callable Functions usan la misma app de staging, sin fallback a producción.
- `firebase.staging.json` no incluye despliegues de Firestore, Storage ni reglas. Las reglas de staging no se sustituyen al publicar web o sessionApi.
- La web muestra “Entorno de pruebas”; la PWA se llama “FertiliApp · Entorno de pruebas”. Analytics y el envío de soporte están desactivados.
- El proxy local `/api` apunta exclusivamente al Hosting de staging. El proceso Vite necesita acceso de red; un primer intento dentro del entorno restringido dio `EACCES`, resuelto reiniciándolo con acceso autorizado. Usar `localhost` para coincidir con los dominios autorizados de Auth.

## Estado remoto final

- Hosting: versión **`9c4fd68cd7b44a48`**, publicada el **2026-09-09 a las 20:18:49 UTC**.
- Una sola Function: **`sessionApi`**, activa, segunda generación, Node 22, `us-central1`, máximo **2** instancias, mínimo **0**.
- Rewrite del frontend: `/api/** → sessionApi`. URL directa: `https://us-central1-fertiliapp-staging.cloudfunctions.net/sessionApi`.
- Runtime: `session-api@fertiliapp-staging.iam.gserviceaccount.com`.
- Rol propio `projects/fertiliapp-staging/roles/stagingSessionAuth`: solo `firebaseauth.users.get`, `firebaseauth.users.createSession` y `firebaseauth.users.update`.
- Firma de custom tokens: `roles/iam.serviceAccountTokenCreator` sobre **su propia cuenta**. No se generaron claves de servicio.
- Invocación pública de **ese servicio**: `roles/run.invoker` para `allUsers`; cada endpoint verifica los tokens/cookies Firebase que necesita.
- Las APIs de Functions, Build, Artifact Registry, Run, IAM Credentials y Compute fueron habilitadas; la CLI provisionó también sus dependencias de Extensions/Eventarc y agentes de servicio.
- Se retiraron los roles `Editor` que Google añadió automáticamente a las nuevas identidades Compute, Cloud Services y App Engine. La identidad de compilación Compute usa `roles/cloudbuild.builds.builder`. Auditoría final: **ninguna cuenta de servicio con Editor**. sessionApi solo tiene su rol propio a nivel de proyecto; no se le concedió acceso a Firestore.
- El primer despliegue creó correctamente la Function, pero la CLI devolvió error al proponer una política de limpieza. Se ejecutó `firebase functions:artifacts:setpolicy --project fertiliapp-staging --location us-central1 --none`: conserva imágenes y evita ese aviso. **No hay borrado automático**. Una futura política de retención requiere revisar y aprobar sus efectos; las imágenes retenidas ocupan almacenamiento.
- Firestore `(default)`: **eur3**. Reglas publicadas **idénticas** a la copia original, comprobadas por SHA-256. Se conservan `entries_by_iso` dentro de cycles y las rutas antiguas `records/measurements`, con acceso limitado al UID propietario.
- Copia de las reglas consultadas: `environments/staging/firestore.deployed.rules`. El archivo raíz `firestore.rules` no contiene todas las rutas antiguas; **no desplegarlo sobre staging**.
- Auth: correo/contraseña habilitado, anónimo sin habilitar, locale español. Dominios: `localhost`, `fertiliapp-staging.firebaseapp.com`, `fertiliapp-staging.web.app`.
- Auth tiene **3 cuentas**: las **2 originales conservadas** y **1 nueva cuenta técnica sintética**. Sus credenciales solo están en `environments/staging/.env.test.local`, ignorado por Git; no se imprimen ni se envían por correo.
- Facturación Blaze ya existente, sin cambios. App Check continúa sin enforcement; PITR, backups programados y protección contra borrado siguen sin activarse. Son decisiones pendientes, no requisitos que bloqueen las pruebas funcionales.

## Validación realizada

1. Build de staging, lint de Functions y **8 pruebas locales** correctas: configuración mezclada, cambio de destino, origen cruzado, export único, runtime de otro proyecto, HTTP sin credenciales y rechazo de tokens con audiencia de producción.
2. **Prueba de integración en Chromium local contra staging real**, con cuenta sintética:
   - Login y `sessionMe`: HTTP 200.
   - Cookie `__session`: HttpOnly, Secure, SameSite=Lax.
   - Restauración en un contexto de navegador nuevo, sin IndexedDB/localStorage y conservando solo la cookie: correcta, incluido el custom token firmado.
   - Lectura/escritura propia en Firestore: correcta.
   - Lectura/escritura en otra ruta de usuario sintético: `permission-denied`.
   - Acceso propio a `entries_by_iso` y `records/measurements`: correcto.
   - Logout, eliminación de cookie y revocación de la sesión anterior: correctos.
   - **0 peticiones a producción**. El test aborta y falla si detecta un destino o una API key de producción.
3. Se conservaron los registros de prueba creados, marcados como sintéticos, bajo el UID técnico. No se borraron ni sobrescribieron datos previos.
4. Workflows con YAML válido, `git diff --check` correcto y revisión de patrones sensibles en archivos versionables.
5. Capacitor sincronizado desde el build de staging. Gradle `:app:verifyFirebaseEnvironment` y `:app:processDebugMainManifest`: **correctos**. No se generó ni instaló un APK completo.
6. Web pública comprobada anónimamente en Chromium: el manifiesto de hashes coincide exactamente con el build local; título, aviso de pruebas y nombre de la PWA correctos. El manifiesto Android generado contiene `com.fertiliapp.fertiliapp.staging` y la etiqueta `FertiliApp Pruebas`.
7. Revisión antes del commit: compilación de producción correcta; repetidas las ocho pruebas y lint de Functions; hashes de staging correctos y artefacto alterado rechazado. YAML de los cinco workflows válido. Se conserva experiment como despliegue manual y se verifica que solo main tiene publicación automática por push. No se han ejecutado los workflows remotos ni generado un APK completo.
8. Comando local de experiment validado con `npm run check:experiment`: consultas reales de solo lectura confirman proyecto, sitio y sessionApi; compilación de producción correcta, sin publicación. Cinco pruebas automáticas de experiment pasan (destino/entorno mezclado, dependencia ausente, modo de comprobación, error de compilación y rechazo de argumentos); las cuatro de aislamiento de staging también siguen pasando. Las pruebas de experiment se incluyen en el workflow de PR. El despliegue real queda para cuando se solicite publicar la versión validada.

La integración usa el servidor de desarrollo local y el backend remoto de staging. No equivale a una prueba completa de todos los flujos de la app, instalación/offline de la PWA o un APK en dispositivo físico.

## Comandos operativos

Desde la raíz:

```powershell
npm run dev
npm run test:staging
npm run build:staging
npm run deploy:staging:hosting
```

Si cambia sessionApi:

```powershell
npm run prepare:staging:session
npm ci --prefix .firebase/session-staging --ignore-scripts --no-audit --no-fund
npm run test:staging:session
npm run deploy:staging:session
```

El paquete generado solo exporta sessionApi; no importa el índice general de Functions ni declara secretos SMTP. Reutiliza el lockfile existente, que incluye nodemailer, aunque este paquete no lo importa ni configura transporte de correo. Las otras Functions no están desplegadas deliberadamente.

Repetir la prueba autenticada, con Vite arrancado y Playwright local instalado:

```powershell
node scripts/staging-browser-check.cjs --project fertiliapp-staging
```

Requiere `playwright-core@1.58.2` en `.firebase/browser-tests` y su Chromium compatible. Las credenciales de `.env.codex.local` se conservan; el test dedicado usa exclusivamente su cuenta sintética. Las credenciales prescritas por AGENTS.md solo pueden usarse en navegador local.

Android:

```powershell
npm run build:staging
npm run sync:staging:android
```

Staging usa `com.fertiliapp.fertiliapp.staging` y etiqueta **FertiliApp Pruebas**. Gradle rechaza assets incompatibles. Para una compilación de producción hacen falta `CAPACITOR_ENV=production`, su build y su sync explícitos. No se ha trabajado en Bluetooth/Health Connect. Los APK previamente instalados conservan su comportamiento anterior.

## Automatización y pendientes

- Staging se puede desplegar **ya desde la terminal local**. El workflow preparado es manual y sigue condicionado a `ENABLE_FIREBASE_STAGING_DEPLOY=true`, GitHub Environment `staging` y credencial propia. No se han creado secretos de GitHub ni activado la automatización.
- PR: validación y build con configuración sintética, sin publicar ni utilizar credenciales de producción.
- Main: workflow de Firebase Hosting con target `production` explícito. Publica el frontend, no Functions ni reglas.
- Experiment: workflow manual `Firebase_hosting_experiment.yml`, con confirmación de backend de producción y target `experiment` explícito. El de staging está ahora en `firebase-hosting-staging.yml`. Los manuales requieren que su definición esté incorporada a main; después permiten elegir una rama. No se han ejecutado remotamente.
- Experiment también puede publicarse desde la terminal o mediante el agente con `deploy:experiment:hosting`, sin Actions ni esperar a incorporar workflows a main. El recorrido inicial elegido es local → staging → experiment → merge a main; más adelante se puede omitir experiment dejando de ejecutar ese comando.
- GitHub Pages heredado: preparado como manual, desactivado por defecto, para evitar una segunda publicación automática al fusionar main. El sitio remoto no se ha eliminado.
- **Estos cambios de workflows siguen locales**: los de GitHub no cambiarán hasta que se publiquen los commits correspondientes, previa revisión. No hacer push/merge dando por hecho que los nuevos controles ya están en el servidor.
- Opcionales pendientes de decisión: dominio personalizado de staging, automatización GitHub, retención de imágenes, backups/PITR y App Check. Experiment se mantiene independiente como frontend contra producción.
- Functions nuevas, reglas o índices deben revisarse y desplegarse por separado, con destino explícito. No copiar datos ni secretos de producción para las pruebas.

## Registro de seguridad

En la fase de inspección anterior se imprimió por error un parámetro sensible de hashing de Auth de staging. Se retiró del informe local y se restringieron las consultas a campos permitidos. Nunca se añadió a Git. La salida ya emitida en la conversación no se puede retirar desde los archivos locales. No se rotó ni modificó esa configuración de Auth; no se consultaron contraseñas/hashes de usuarias ni secretos SMTP.

Evidencia auxiliar local, ignorada por Git: `.firebase/staging-final-audit.json`, `.firebase/staging-browser-result.json` y `.firebase/site-inspection.json`.

Referencias: [gestión de Functions](https://firebase.google.com/docs/functions/manage-functions), [permisos de Auth](https://firebase.google.com/docs/projects/iam/permissions), [firma de custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens) y [dominios de Hosting](https://firebase.google.com/docs/hosting/custom-domain).
