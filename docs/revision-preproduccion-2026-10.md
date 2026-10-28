# Revisión previa a producción — 27 de octubre de 2026

Rama: `mayo_interpertacion`. No se han realizado commits, merges, push ni despliegues.

El único cambio previo era `src/pages/ChartPage.jsx`. Su SHA-256 inicial y final coincide:
`176C9297D35DCB2CFD50D5B1858FE4ED600D11366C85404627FAEB1933407281`.
Ese cambio pertenece al usuario y no forma parte de estas correcciones.

## 1. Recuperación de sesión

Archivos: `src/contexts/AuthContext.jsx`, `src/App.jsx`, nuevo `src/lib/sessionRecovery.js`, nuevo `scripts/auth-recovery.test.mjs`.

Antes, almacenamiento persistente, preferencias y operaciones secundarias podían retrasar el desbloqueo. Las comprobaciones de primer plano activaban la pantalla global de recuperación.

Ahora:

- Una confirmación de Firebase abre la sesión sin esperar preferencias, Analytics, almacenamiento o cookie.
- El arranque y cada restauración tienen un límite de 12 segundos, configurable en `SESSION_RECOVERY_TIMEOUT_MS`.
- Los fetch de sesión admiten cancelación y tienen límite temporal. Las operaciones SDK usan generaciones y `beforeAuthStateChanged` para impedir que una restauración obsoleta instale un usuario después de logout, timeout, desmontaje o cambio de cuenta.
- Las comprobaciones de primer plano se agrupan en una operación y una ventana de 1,5 segundos, sin polling ni pantalla global. Un fallo temporal no cierra una sesión válida.
- Un 401 permite ir a login. Los errores temporales presentan «No hemos podido recuperar tu sesión», reintento y acceso alternativo a login, sin hacer signOut por timeout.
- Las preferencias se cargan de caché y después de Firestore; no se escriben defaults durante la carga. Las respuestas antiguas no pisan ediciones ni otra cuenta. Un error remoto conserva la caché disponible.
- Inicio, gráfica y edición de preferencias esperan una preparación específica. La navegación sigue disponible. Esto evita interpretar con defaults mientras faltan los ajustes. No se han cambiado algoritmos de interpretación.
- Novedades distingue preferencias disponibles de preferencias confirmadas remotamente, para no abrir una ventana por una caché antigua.

15 pruebas aisladas ejecutan el código del proveedor con adaptadores: inicio autenticado, ausencia de cookie, 401, restauración, backend colgado, red, reconexión, eventos consecutivos, logout en fetch y en SDK, cambio de cuenta, timeout SDK, caché, preferencias tardías y error/reintento con almacenamiento restringido.

Límites: el SDK no permite cancelar un sign-in ya iniciado. Se veta su resultado obsoleto; un nuevo login espera a que termine, con espera acotada. Si el SDK permanece atascado, el nuevo login devuelve error y requiere reintento. No se ha validado el ciclo de vida real de Safari/iPhone, IndexedDB restringido del dispositivo ni persistencia al cerrar la PWA. Un fallo al limpiar la cookie en el backend no puede garantizar su eliminación en un arranque posterior; durante el montaje actual se impide la restauración después de logout.

## 2. Temperaturas

Archivos: `src/lib/cycleDataHandler.js`, `src/contexts/CycleDataContext.jsx`, nuevo `scripts/temperature-persistence.test.mjs`.

Antes, guardar el resumen, borrar las mediciones y crear sus sustitutas eran operaciones separadas.

Ahora `updateCycleEntry` y `upsertCycleEntryByIsoDateDB` preparan las referencias y confirman resumen, borrados, nuevas mediciones e índice diario (en upsert) mediante un único `writeBatch`. Se rechazan conjuntos que superen 500 operaciones, sin fragmentar la sustitución. Un fallo de preparación no escribe nada.

Se conservan campos y orden; el campo `id` de los borradores no se copia a Firestore. Los IDs de las nuevas referencias vuelven al estado local. Una medición continúa en el resumen y dos o más en la subcolección. Las mediciones sin cambios conservan sus documentos. Las ediciones parciales no consultan ni sustituyen la subcolección; la integración conserva también el resumen y la hora en memoria. Se ha evitado interpretar ausencia de un arreglo como un borrado explícito.

Se han ejecutado 21 pruebas con Firestore simulado: una/tres mediciones, lectura completa de campos, selección, corrección, altas, bajas, tres a una y viceversa, eliminación total, observaciones/moco, historial, error de commit sin cambios parciales, offline/caché incompleta, límite de lote, índice diario, IDs y resumen en memoria.

Limitaciones expresas:

- Cargar la subcolección como completa y sustituir temperaturas requiere lectura del servidor. No se acepta una colección parcial en caché como inventario completo. Los errores permiten reintentar; la experiencia de edición offline de temperaturas queda limitada deliberadamente.
- Si se pierde la conexión después de la lectura, el lote puede quedar pendiente. Se espera `commit()`; no se devuelve éxito antes de su resolución. No se ha añadido un timeout que confundiera una escritura pendiente con una escritura cancelada.
- Atomicidad no equivale a aislamiento de editores: la consulta previa y el lote no constituyen una transacción de toda la colección. No se garantiza ausencia de conflictos, datos omitidos o duplicados cuando dos dispositivos sustituyen simultáneamente el mismo día. Tampoco se puede detectar con este contrato que un formulario completo haya quedado obsoleto por una edición remota posterior. Esto necesita una decisión adicional de control de versiones/concurrencia y validación aislada antes de prometer esa garantía.
- Los tests usan un adaptador en memoria, no un emulador Firestore. Demuestran la preparación y agrupación de operaciones del cliente; no validan las reglas reales ni el SDK en red. No se realizaron escrituras de prueba sobre producción ni cuentas reales.
- Los consumidores activos usan las dos funciones corregidas. Los helpers antiguos sin consumidores activos, las operaciones de división/combinación, Bluetooth y PDF no se han modificado ni se certifica aquí su ejecución funcional.

## 3. Novedades

Archivos: `src/contexts/WhatsNewContext.jsx`, nuevo `scripts/whats-new-release.test.mjs`.

Versión actual: `2026-10-mejoras`. `WHATS_NEW_ANNOUNCEMENT_ENABLED` y `WHATS_NEW_INDICATORS_ENABLED` están separados y ambos son `false`. No se marca ficticiamente la versión como vista ni se borra historial. `WhatsNewModal.jsx` y el aviso técnico de PWA permanecen intactos.

8 pruebas aisladas verifican cuentas antiguas/nuevas, sin reconocimiento previo, offline, almacenamiento restringido, indicadores apagados, versión futura habilitada solo dentro del test, rechazo de sincronización antigua y reconocimiento desde un segundo dispositivo simulado.

Para anuncios futuros se espera confirmación remota antes de abrir. La deduplicación en memoria/local y el campo remoto se mantienen. No se ha probado una carrera simultánea de dos dispositivos antes de que cualquiera haya guardado el reconocimiento, ni cierre de la app antes de reconocer la ventana.

## 4. Validación y pendientes

Infraestructura de pruebas compartida: nuevo `scripts/helpers/load-frontend.mjs`. Transforma el código real con esbuild ya instalado y lo ejecuta con dependencias explícitas de prueba. No añade dependencias. El simulador de hooks no sustituye una prueba de montaje con el scheduler real de React ni una prueba end-to-end.

| Comando | Resultado |
| --- | --- |
| `npm run test:staging` | 4/4 |
| `npm run test:experiment` | 5/5; las acciones de despliegue del test están simuladas |
| `node --test scripts/temperature-measurements.test.mjs` | 13/13 |
| `node --test scripts/auth-recovery.test.mjs scripts/temperature-persistence.test.mjs scripts/whats-new-release.test.mjs` | 44/44 |
| `npm run check:staging` | Correcto |
| `npm run build:staging` | Correcto; comprobación de configuración y hashes incluida |
| `npm run prepare:staging:session` | Correcto; paquete local aislado en `.firebase/session-staging` |
| `npm run test:staging:session` | Primer intento: 3/4, fetch local bloqueado en sandbox. Repetición fuera del sandbox: 4/4 |
| `npm run build:production` | Correcto con configuración existente, sin sustituir variables ni proyecto |
| `git diff --check` | Correcto |
| Vite local staging | Primer arranque: EACCES en sandbox. Arranque autorizado fuera del sandbox: correcto; detenido al terminar |

Los primeros intentos de las pruebas nuevas detectaron errores en el cargador de pruebas (ruta de preferencias y transformación de imports); se corrigieron y se repitieron. No se ocultan esos intentos fallidos.

Comprobación visual realizada: navegador integrado, `127.0.0.1:5174`, arranque sin sesión hasta login y consulta de consola sin errores. La URL de pruebas de `.env.codex.local`, `http://localhost:5173/`, mostró «Sin conexión». No se introdujeron credenciales en un destino alternativo.

Pendiente: login/logout reales, cookie real, cierre y reapertura, PWA offline/reconexión completa, navegación autenticada, preferencias entre dispositivos, temperaturas desde registros/gráfica/bottom sheet, ciclos archivados, PDF, Bluetooth y consola durante esos flujos. Tampoco se ejecutaron Safari, iPhone ni Android reales. No se declaran aprobadas estas pruebas.

Revisión de alcance: sin modificaciones en Functions, Rules, secretos, configuración Firebase, Android, Gradle, Capacitor, Bluetooth/Femometer, Health Connect ni cálculos. Sin dependencias nuevas ni despliegues independientes requeridos. La preparación local del paquete de sesión es una operación de prueba, no una modificación de backend desplegado.

Recomendación: preparados para revisión de código y validación final aislada, pero no para autorizar publicación basándose solo en esta ejecución. Antes de producción deben resolverse los pendientes funcionales y decidirse el alcance exigido para la concurrencia entre dispositivos.

Referencias primarias utilizadas: [bloqueo previo de cambios Auth](https://firebase.google.com/docs/reference/js/auth.auth#authbeforeauthstatechanged) y [atomicidad y límites de lotes Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Seguimiento: logout y lectura offline

Esta revisión posterior sustituye las limitaciones anteriores sobre consulta obligatoriamente online y restauración tras logout.

- Logout graba una marca persistente antes del primer await, invalida y cancela refrescos, cierra Firebase localmente y espera la limpieza de cookie después de drenar esos refrescos. La espera local y la fase de limpieza están acotadas cada una a 12 segundos. Los errores del backend se comunican sin revertir el cierre local.
- La marca impide restauraciones por cookie y rechaza la hidratación residual de la sesión cerrada al reabrir. Permanece tras errores y solo se retira cuando, después de un login explícito, se confirma una cookie nueva. Un login nuevo espera cualquier logout en curso. Si la cookie nueva no se confirma, por seguridad una reapertura puede exigir login de nuevo.
- Cuando el almacenamiento no es legible o escribible se desactiva la recuperación por cookie. No es posible prometer persistencia de la intención de logout si el navegador borra esa marca, impide escribirla y después cambia de política, o se usa otro perfil/origen. Tampoco se garantiza la revocación de una cookie HttpOnly en el servidor sin red; el bloqueo local evita utilizarla en este origen mientras la marca se conserva. No se han modificado Functions.
- La consulta usa de nuevo getDocs y devuelve un resultado explícito con measurements y measurementsComplete. Cualquier snapshot de caché o con escrituras pendientes se considera incompleto, incluso vacío.
- CycleDataContext conserva esa condición por cuenta/ciclo/entrada y bloquea una edición que intente elevar una lectura parcial a completa. El helper de formularios respeta el indicador explícito aunque haya elementos. Se protege asimismo la eliminación implícita de un día al quitar su marca de pico cuando solo se conoce una parte del registro.
- Sustituir mediciones sigue requiriendo la consulta completa del servidor y el lote atómico existente. Consultar offline no da permiso para editar la lista parcial. No se ha ampliado la garantía de concurrencia entre dispositivos.
- Archivos de código de este seguimiento: AuthContext.jsx, cycleDataHandler.js, CycleDataContext.jsx y temperatureMeasurements.js. Tests ampliados: auth-recovery.test.mjs, temperature-persistence.test.mjs y temperature-measurements.test.mjs. ChartPage, Novedades e infraestructura no se han editado en este seguimiento.
- Validación del seguimiento: autenticación 23/23; persistencia 25/25; helpers de temperaturas 14/14; staging 4/4; experiment 5/5; sesión staging 4/4 fuera del sandbox; check:staging correcto; compilaciones staging y producción correctas con configuración existente. git diff --check correcto. Sin pruebas nuevas en navegador real ni escrituras sobre cuentas reales.
