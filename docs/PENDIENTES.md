# FertiliApp · Pendientes y decisiones

**Proyecto:** RNF APP · **Revisión inicial:** 19/11/2026  
**Propósito:** registro vivo y único de tareas, ideas aprobadas y decisiones antes del lanzamiento Android. No es un plan de implementación automática ni una autorización de despliegue.

## Cómo mantener este documento

- `[ ]` pendiente; `[x]` terminado únicamente después de implementar, probar y revisar el commit real. Añadir fecha, commit o evidencia al cerrar una tarea.
- Conservar las ideas aprobadas y su contexto, aunque todavía no tengan código. No borrar tareas por haber cambiado de chat.
- Antes de comenzar una tarea, revisar la versión actual de GitHub y este documento; al finalizar, actualizar estado y registrar nuevas decisiones.
- Mantener una copia canónica en los archivos/fuentes del proyecto RNF APP. Si se prefiere versionarla en GitHub, usar `docs/PENDIENTES.md` y mantener sincronizada la copia del proyecto. No crear dos listas independientes.
- Prioridad: **P0** bloquea lanzamiento; **P1** importante antes de publicar; **P2** posterior u opcional. El orden es orientativo y se revisará según dependencias.

## 1. Estado de partida verificado

Consulta de GitHub: rama `nov26`, commit `6b8e3d532082ccd7fbbb6c47899b3e4d7a831813`. Es una fotografía de la revisión, no una suposición sobre el estado futuro.

- React 18 + Vite + Capacitor 5.7.8; Firebase Auth, Firestore, Functions y persistencia offline. No reescribir en Kotlin ni duplicar la aplicación web.
- `capacitor.config.ts`: `webDir` es `dist-staging` o `dist`, pero `server.url` apunta a `https://fertiliapp-staging.web.app` o `https://rnf-app.web.app` según `CAPACITOR_ENV`. Por tanto, Android sigue cargando el frontend remoto.
- `android/variables.gradle`: `minSdkVersion = 26`, `compileSdkVersion = 34`, `targetSdkVersion = 34`.
- Bluetooth multimarca en desarrollo, limitado al Android de Staging. PWA y producción no deben activarlo accidentalmente.
- Los cambios locales de interfaz de vinculación (asistente, radar, ilustración SVG) se han probado visualmente en localhost; falta confirmar la versión final, pruebas y commit. No se dan por cerrados.
- Staging utiliza el backend separado `fertiliapp-staging`. Experiment usa el backend real: no usarlo para pruebas de escritura sin cuenta de prueba. Publicar Hosting no publica Android ni Functions/reglas.

## 2. P0 · Finalizar Bluetooth antes de activarlo en producción

- [ ] **BLE-01 — Cerrar cambios visuales actuales.** Dashboard: icono Bluetooth animado y eco secundario; detalle de dispositivo: botón integrado para conectar/detener; tarjeta Añadir termómetro tipo asistente; radar durante búsqueda; lista y reintento dentro de la tarjeta; ilustración estática de móvil estilizado y termómetro tipo Vinca 2 sin logotipo. Ejecutar `npm run test:staging` y `npm run build:staging`; revisar commit.
- [ ] **BLE-02 — Reinicio del asistente.** Reabrir Añadir tras cancelar, buscar o navegar: mostrar tutorial inicial y botón de cierre; no arrastrar resultados, barras de etapa ni botón de reintento de una búsqueda anterior. Verificar tanto laboratorio como APK real, incluyendo primer dispositivo y dispositivo adicional. Revisar las condiciones `searched`, `normalSearched`, `devices.length` y `changing` de `src/pages/DevicesPage.jsx` y el contrato de cancelación real; no atribuirlo sin comprobar al simulador.
- [ ] **BLE-03 — Históricos Easy@Home EBT-300.** Admitir varias lecturas históricas en la cola de pendientes, igual que el Vinca 2, solo cuando se pueda validar la unidad y la recepción. Confirmación manual de fecha/hora y medición, sin inventar fechas ni incorporación automática. Verificar formato de paquetes históricos con hardware real; si la unidad no es demostrable, no incorporar como Celsius por suposición. Conservar origen y metadatos; probar duplicados, desconexión, almacenamiento, cancelación y cambio de cuenta/dispositivo.
- [ ] **BLE-04 — Celsius en EBT-300.** Eliminar la opción Fahrenheit para ese perfil y acordar cómo asegurar Celsius en conexión/configuración. No confundir ajuste actual con unidad histórica; mantener la conversión estándar BLE para otros dispositivos compatibles. No tocar otros perfiles innecesariamente.
- [ ] **BLE-05 — Validación física y robustez.** Vinca 2, EBT-300 y dispositivo estándar experimental: vincular, recibir varias mediciones, revisar/incorporar, duplicados, desvincular, reconectar, app en segundo plano y primer plano, apagado de Bluetooth y permisos denegados, cambio de cuenta, fallos de guardado y recuperación offline. No prometer compatibilidad universal ni escucha permanente. Revisar restauración de preferencias de termómetro por dispositivo si existen discrepancias entre metadata y conexión.
- [ ] **BLE-06 — Activación de producción.** Solo tras superar revisión y pruebas reales. Definir expresamente el límite por plataforma/entorno, proteger PWA, verificar que datos de producción no se mezclan con Staging y que la app distribuida conserva las garantías de incorporación manual. Revisar antes de cambiar la barrera actual.

## 3. P0/P1 · Android: preparar una aplicación distribuible

- [ ] **AND-01 (P0) — Actualizar plataforma Android.** Revisar la ruta de actualización de Capacitor, Gradle/Android Gradle Plugin, Java/JDK, plugins y SDK. Google Play exige actualmente API objetivo 36 o superior para apps nuevas y actualizaciones de teléfono (verificar de nuevo al publicar). La configuración actual está en API 34. No basta con cambiar un número si la toolchain no lo soporta. Revisar compatibilidad de versiones, requisitos de bibliotecas nativas y regresiones. Mantener minSdk según compatibilidad acordada; targetSdk no significa que solo funcione en Android 16.
- [ ] **AND-02 (P0) — Empaquetar el frontend dentro de la app.** Probar primero en Staging: servir los assets compilados desde `webDir` sin `server.url` remoto en el candidato distribuible. Mantener flujo cómodo de desarrollo remoto/live reload solo como entorno de pruebas si interesa. Adaptar scripts existentes y revisar los controles de aislamiento antes de modificar configuración. No cambiar la PWA ni las Functions por este motivo.
- [ ] **AND-03 (P0) — Migración de origen y datos locales.** Probar Firebase Auth (incluidos proveedores reales y redirecciones si existen), persistencia de sesión, Firestore/IndexedDB, rutas, enlaces, service worker/PWA, CORS/Functions, Analytics, preferencias y permisos desde el origen local de Capacitor. Las cuentas y datos sincronizados permanecen en Firebase, pero el almacenamiento del origen remoto anterior no se transfiere automáticamente al nuevo. Definir tratamiento de datos pendientes o no sincronizados en APK de prueba y no prometer migración automática.
- [ ] **AND-04 (P0) — Offline y arranque.** Abrir app con y sin conexión (incluida primera instalación y sesión previa), probar datos en caché, escrituras pendientes y sincronización posterior; mensajes claros ante datos no disponibles. Empaquetar evita depender de la descarga inicial de la interfaz, no hace offline todas las funciones ni garantiza acceso a datos no descargados.
- [ ] **AND-05 (P1) — Experiencia Android propia.** Revisar barras de estado/navegación y edge-to-edge, safe areas, botón/gesto Atrás (incluidas ventanas), teclado y formularios, scroll (sin barra rosa innecesaria), escalado de texto, accesibilidad, movimiento reducido, orientación, arranque/splash, icono y transiciones. Parte del escalado y barras se trabajó anteriormente; comprobar estado actual antes de rehacerlo. Mantener iPhone/Safari y PWA intactos.
- [ ] **AND-06 (P0) — Health Connect.** Comprobar permisos y flujo real, incluida apertura de la pantalla de permisos, compatibilidad por versión Android, ausencia de Health Connect, revocación, lectura/sincronización y no duplicación de temperaturas. Revisar declaraciones de Play y datos de salud. No asumir que la incidencia antigua de permisos sigue presente ni que está resuelta; comprobar con APK real.
- [ ] **AND-07 (P0) — Pruebas y actualización.** APK de Staging en dispositivos reales de varias versiones/tamaños; instalación limpia, actualización sobre versión anterior, arranque offline, inicio de sesión, ciclo/registro/gráfica, datos pendientes, Bluetooth, Health Connect y retrocompatibilidad con backend compartido. Confirmar que versiones Android antiguas de la app pueden convivir con web nueva y cambios de Firebase.

## 4. P1 · Bienvenida Android / Novedades — IDEA APROBADA

La usuaria que ya utilizaba la PWA debe descubrir las ventajas de instalar Android. Bluetooth es la funcionalidad protagonista. Conservar el diseño de tres pantallas aprobado el 19/11/2026 (ver anexo SVG y `Tutorial_Android.html`, previsualización opcional).

### Diseño visual aprobado

| Pantalla | Título | Texto | Ilustración |
|---|---|---|---|
| 1 | Tu termómetro, conectado | Ahora puedes recibir tus temperaturas basales directamente desde un termómetro Bluetooth compatible. | Móvil alto y estrecho, termómetro basal inclinado tipo Vinca 2, punta metálica, cuerpo blanco, base rosa, pantalla gris, ondas estáticas; sin marcas. |
| 2 | Menos registros manuales | Revisa tus mediciones recibidas e incorpóralas a tu ciclo sin tener que copiar la temperatura. | Móvil mostrando una temperatura ficticia (36,42 °C) y confirmación. |
| 3 | Todo sigue en tu cuenta | Tus ciclos, registros y preferencias siguen disponibles. No necesitas empezar de nuevo. | Gráfica de ciclo esquemática con puntos y línea rosa. |

Estilo: tarjeta blanca, bordes suaves, fondo rosa circular `#fff1f3`, acento `#d65a73`, texto principal `#432d38`, secundario `#64748b`. SVG estático, ligero, sin recursos externos. Etiqueta superior «FERTILIAPP · ANDROID», indicador de tres puntos (activo alargado), botón Continuar y opción de saltar. No añadir animación de búsqueda donde aún no se está buscando.

### Comportamiento a concretar antes de programar

- [ ] **ONB-01 — Revisar Novedades existente** y diseñar una experiencia exclusiva de Android nativo, solo cuando Bluetooth esté disponible de verdad para esa versión. No mostrar en PWA ni por instalar una versión de prueba que no tenga la funcionalidad habilitada. Reutilizar el sistema de preferencias; no disparar permisos automáticamente al iniciar.
- [ ] **ONB-02 — Persistencia.** Una sola vez por usuaria y versión de bienvenida Android, registrada en Firebase. Usar identificador independiente del `WHATS_NEW_VERSION` general para evitar que haber visto novedades web o Android suprima indebidamente la otra experiencia. Mantener compatibilidad con preferencias antiguas y decidir si la introducción se considera vista al saltar/cerrar o al completar; propuesta: ambos cierran y registran visto. Diferenciar esta política por cuenta de la instalación por dispositivo.
- [ ] **ONB-03 — Acciones finales.** Continuar / saltar / cerrar. Última pantalla: ofrecer «Configurar termómetro» que lleva a Dispositivos y «Ahora no» (o «Empezar» para ir al dashboard); nunca obligar a vincular. Propuesta de acción final pendiente de validar. Los datos sincronizados seguirán en la cuenta; no dar garantías sobre borradores no sincronizados.
- [ ] **ONB-04 — Reutilizar ilustraciones y pruebas.** Incorporar el diseño aprobado con React/JSX, preferiblemente como componentes SVG sin duplicación innecesaria; probar móvil, accesibilidad, botón Atrás, cierre, cambio de usuaria, cuenta existente de PWA, reinstalación/actualización, versión nueva y Firebase offline. La maqueta no equivale a código de producción.

## 5. P0 · Distribución en Google Play

- [ ] **PLAY-01 — Preparar cuenta, firma y versiones.** Identificador definitivo `com.fertiliapp.fertiliapp`, clave de subida y copia de seguridad segura, Play App Signing, `versionCode` creciente y `versionName`. Generar AAB firmado de producción (APK de Staging para pruebas directas). No guardar secretos de firma en GitHub ni en este documento.
- [ ] **PLAY-02 — Cumplimiento.** Revisar requisitos vigentes de API objetivo, pruebas exigidas según tipo/fecha de cuenta, políticas de salud, ficha de seguridad de datos, privacidad, declaración de Health Connect, permisos, eliminación de cuenta cuando aplique, acceso de revisión y contenido de ficha. Verificar en Play Console; no asumir plazos ni aprobación automática.
- [ ] **PLAY-03 — Lanzamiento.** Prueba interna/cerrada según proceda, revisión de Play, distribución gradual si está disponible, seguimiento de fallos y soporte. Las actualizaciones de Play pueden ser automáticas, pero dependen de configuración, conexión y disponibilidad: no todas las usuarias reciben cada versión a la vez.
- [ ] **PLAY-04 — Comunicación a usuarias de PWA.** Decidir cuándo anunciar Android en la web y cómo ofrecer enlace a Google Play, solo tras disponibilidad real. Explicar misma cuenta y ventajas, sin forzar migración ni retirar la PWA. La bienvenida Android queda separada del anuncio web.

## 6. P2 · Después del lanzamiento

- [ ] Valorar iOS con Capacitor/Xcode/Core Bluetooth, permisos y TestFlight, sin comprometer el calendario Android ni sustituir la PWA.
- [ ] Valorar automatizar builds AAB firmados y publicación en canales de prueba, con aprobación humana de lanzamiento y secretos protegidos.
- [ ] Mantener futuras ideas aquí con identificador, objetivo, prioridad, estado y fecha de revisión.

## 7. Decisiones técnicas y orden de trabajo

1. Cerrar Bluetooth y su interfaz en Staging; conservar cambios pequeños y commits separados.
2. Revisar actualización de Capacitor/Android y empaquetado local en ramas de trabajo, con pruebas específicas de migración y plataforma. Coordinar dependencias con Bluetooth, sin activar producción prematuramente.
3. Pulir experiencia Android y construir bienvenida aprobada.
4. Preparar candidato AAB, pruebas reales y requisitos Play; activar funciones de producción solo tras revisión explícita.
5. PWA sigue su flujo de Firebase Hosting; Android y backend tienen ciclos de publicación separados. Proteger compatibilidad de las versiones antiguas.

**Por qué empaquetar:** interfaz disponible localmente sin descargar el sitio en cada arranque, menor dependencia de Hosting, versionado coherente entre frontend y plugin nativo, pruebas reproducibles y menor riesgo de que un despliegue web rompa una APK antigua. Firebase sigue siendo el backend compartido. No implica migración a Kotlin, no garantiza offline total ni acelera por sí solo consultas Firebase o cálculos React.

**Flujo del proyecto:** revisar código → acordar comportamiento → cambio mínimo (Codex/manual) → pruebas → commit → revisar GitHub → decidir despliegue. No mezclar cambios de backend/Rules con Hosting o Android. Mantener `WHATS_NEW_VERSION` general sin cambios por mejoras menores.

**Comandos actuales útiles:** `npm run dev`, `npm run check:staging`, `npm run test:staging`, `npm run build:staging`, `npm run sync:staging:android`. Para el cambio de empaquetado habrá que revisar los scripts antes de fijar nuevos comandos de publicación.

**Referencias verificadas:** [Capacitor config](https://capacitorjs.com/docs/config), [Requisitos de API objetivo de Google Play](https://support.google.com/googleplay/android-developer/answer/11926878), [Actualizaciones automáticas en Android](https://support.google.com/googleplay/answer/113412). Revisar vigencia de políticas antes de publicar.

## 8. Anexo: ilustraciones del tutorial aprobado

SVG de referencia, preservado aquí para no depender de chats anteriores. Al llevar a JSX, convertir atributos SVG a camelCase cuando corresponda. Los valores mostrados son ficticios y decorativos.

### Pantalla 1 — Tu termómetro, conectado

```html
<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
  <circle cx="80" cy="50" r="43" fill="#fff1f3"/>
  <rect x="29" y="13" width="29" height="63" rx="6.5" fill="white" stroke="#d65a73" stroke-width="1.8"/>
  <rect x="32" y="16" width="23" height="57" rx="4" fill="#fdf6f8"/>
  <rect x="40" y="17.5" width="7" height="2.2" rx="1.1" fill="#eab8c4"/>
  <path d="M38 39l11 11-5.5 5V33l5.5 6-11 11" stroke="#d65a73" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M66 39Q74 48 66 57" stroke="#d65a73" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M75 33Q88 48 75 63" stroke="#d65a73" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>
  <g transform="rotate(20 113 50)">
    <rect x="111" y="7" width="4" height="14" rx="1.8" fill="#aeb6c2"/>
    <rect x="112" y="9" width="1.3" height="9" rx=".6" fill="#edf0f4"/>
    <path d="M111 19L115 19C115 36 118 44 121 56Q122 61 122 64H104Q104 61 105 56C108 44 111 36 111 19Z" fill="white" stroke="#d1d5db" stroke-width="1.1"/>
    <rect x="109" y="44" width="8" height="15" rx="3" fill="#e4e4e8" stroke="#d1d5db" stroke-width=".6"/>
    <text x="113" y="53" font-size="3.5" text-anchor="middle" fill="#64748b" transform="rotate(90 113 51.5)">36.42</text>
    <path d="M104 63H122V82Q122 85 119 85H107Q104 85 104 82Z" fill="#df91ad" stroke="#cd7495"/>
    <path d="M107 66V81" stroke="#f6c3d5" stroke-width="1.5" stroke-linecap="round" opacity=".8"/>
  </g>
</svg>
```

### Pantalla 2 — Menos registros manuales

```html
<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
  <circle cx="80" cy="50" r="43" fill="#fff1f3"/>
  <rect x="44" y="5" width="72" height="90" rx="11" stroke="#d65a73" stroke-width="1.8" fill="white"/>
  <rect x="69" y="11" width="22" height="3" rx="1.5" fill="#e9abb9"/>
  <rect x="51" y="25" width="58" height="49" rx="6" fill="#fff1f3"/>
  <text x="80" y="44" font-size="7" fill="#b65b73" text-anchor="middle">Nueva temperatura</text>
  <text x="80" y="60" font-size="14" font-weight="600" fill="#432d38" text-anchor="middle">36,42 °C</text>
  <rect x="55" y="79" width="50" height="9" rx="3" fill="#d65a73"/>
  <path d="M75 83l3 2 6-4" stroke="white" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### Pantalla 3 — Todo sigue en tu cuenta

```html
<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
  <circle cx="80" cy="50" r="43" fill="#fff1f3"/>
  <rect x="20" y="17" width="120" height="66" rx="10" fill="white" stroke="#e4a0af" stroke-width="1.5"/>
  <path d="M31 31H130 M31 43H130 M31 55H130 M31 67H130" stroke="#f2e4e8" stroke-width=".7"/>
  <path d="M33 63L44 58 55 62 66 60 77 64 88 45 99 39 110 44 124 35" stroke="#d65a73" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="33" cy="63" r="2.5" fill="#d65a73"/>
  <circle cx="44" cy="58" r="2.5" fill="#d65a73"/>
  <circle cx="55" cy="62" r="2.5" fill="#d65a73"/>
  <circle cx="66" cy="60" r="2.5" fill="#d65a73"/>
  <circle cx="77" cy="64" r="2.5" fill="#d65a73"/>
  <circle cx="88" cy="45" r="2.5" fill="#d65a73"/>
  <circle cx="99" cy="39" r="2.5" fill="#d65a73"/>
  <circle cx="110" cy="44" r="2.5" fill="#d65a73"/>
  <circle cx="124" cy="35" r="2.5" fill="#d65a73"/>
</svg>
```

## 9. Registro de revisiones

| Fecha | Decisión / cambio | Estado |
|---|---|---|
| 19/11/2026 | Crear lista de pendientes; conservar bienvenida de tres pantallas y estilo SVG. | Idea aprobada, implementación pendiente |
| 19/11/2026 | Confirmar configuración remota y API 34 en `nov26`. | Verificado en GitHub; cambios pendientes |

