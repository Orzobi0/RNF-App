# Fase 2: escucha al abrir Ajustes (Android Staging)

La asociación de la fase 1 se conserva sin cambios. El panel consulta el UID de la sesión autenticada y, solo si tiene termómetro recordado, realiza un intento automático. Utiliza `scan(userId)`, que comprueba permisos existentes y Bluetooth antes de iniciar la búsqueda y nunca solicita permisos. La búsqueda conserva el límite nativo de 8 segundos.

Solo una coincidencia explícita y única `isRemembered === true` permite iniciar la escucha. En este flujo no se muestran otros dispositivos, no se inspecciona de nuevo manualmente la compatibilidad y no se elige por nombre ni intensidad de señal. Se utiliza la misma suscripción y el mismo método de escucha de temperaturas del diagnóstico manual. No hay escritura de temperaturas ni reconexiones/búsquedas periódicas.

Los estados del panel son consultando, buscando, conectando, escuchando, no encontrado, error y detenido. Reintentar repite un único intento sin pedir permisos. Buscar termómetro conserva la alternativa manual y puede solicitar permisos mediante el flujo existente. Los errores y Bluetooth apagado no eliminan la asociación. Olvidar sigue disponible cuando la operación está detenida.

`femometerSession.js` concentra la exclusión de operaciones, la propiedad del BLE entre montajes y la invalidación de continuaciones/eventos. Un montaje nuevo espera a la limpieza del anterior. La cancelación también recoge suscripciones que terminan de registrarse después de salir de la pantalla. Las lecturas y callbacks tardíos no actualizan React tras el desmontaje. El replay de efectos de StrictMode no inicia una segunda búsqueda.

Se modifica el código nativo únicamente para que cancelar resuelva las llamadas pendientes de búsqueda y preparación de escucha como `CONNECTION_CANCELLED`, y para ignorar callbacks/plazos de operaciones anteriores. Esto evita que una búsqueda cancelada deje una promesa pendiente o que su plazo de 8 segundos interrumpa un reintento posterior. No se cambian permisos ni preferencias persistentes.

## Pruebas automáticas

Las pruebas en `android-ui.test.mjs` ejercitan el controlador que utiliza el panel con un puente simulado: coincidencia, falta de coincidencia, ausencia de asociación, permisos denegados, Bluetooth apagado, cierre durante búsqueda, suscripción tardía, cancelación durante conexión, montajes duplicados, cambio de cuenta, reintento y finalización sin reconexión automática. `femometer-bridge.test.mjs` comprueba también el recorrido por los wrappers reales y los payloads de UID/identificador temporal. No sustituyen una prueba BLE física ni montan una WebView Android real.

## Comprobaciones con APK y BM-Vinca2

1. Con termómetro recordado y permisos concedidos, abrir Ajustes: buscar → conectar → escuchar sin pulsar botones. Confirmar que solo aparece el recordado, incluso con otro BM-Vinca2 cerca.
2. Sin asociación: abrir Ajustes y verificar que no empieza ninguna búsqueda ni diálogo. Validar búsqueda, selección, inspección, recordar y escuchar manualmente.
3. Con asociación y Bluetooth apagado o permisos revocados: abrir Ajustes. Debe mostrarse error sin diálogo automático y conservarse la asociación. Restablecer Bluetooth/permisos mediante la acción manual y reintentar.
4. Mantener el termómetro apagado: después de unos 8 segundos mostrar no encontrado, sin más intentos hasta pulsar Reintentar o volver a abrir Ajustes.
5. Salir durante búsqueda, conexión y escucha; volver rápidamente. Confirmar una sola conexión y suscripción, sin lecturas de la sesión anterior ni interrupciones por el plazo de una búsqueda previa.
6. Pulsar Detener durante búsqueda/conexión/escucha y luego Reintentar. Cambiar de cuenta y comprobar que no se escucha el termómetro de la cuenta anterior.
7. Recibir varias mediciones, dejar expirar la escucha y desconectar el dispositivo. No debe reconectar automáticamente. Los datos siguen siendo diagnósticos, incluidas lecturas antiguas y fechas incorrectas.

Se necesita un APK con la corrección nativa y esta versión del frontend. La configuración existente carga el Hosting de Staging: sincronizar el APK no publica el frontend remoto. No se modifica ese empaquetado ni se despliega. Sigue vigente la limitación de identidad por dirección BLE de la fase 1: una dirección distinta no se reconoce automáticamente.

## Validación ejecutada el 30 de octubre de 2026

- `npm run check:staging`: correcto.
- `npm run test:staging`: 4 pruebas correctas.
- `node --test scripts/femometer-bridge.test.mjs scripts/android-ui.test.mjs`: 14 pruebas correctas; aviso no fatal de puerto WebSocket 24678 ocupado.
- `npm run build:staging`: correcto.
- `npm run sync:staging:android`: correcto.
- `CAPACITOR_ENV=staging` y `gradlew.bat assembleDebug`, con el JDK de Android Studio2 y el wrapper actual 9.2.0: BUILD SUCCESSFUL. Fue necesario permitir escritura fuera del sandbox para la caché de Gradle. No se cambiaron wrapper ni configuración de compilación.
- `git diff --check`: correcto.

No se ha instalado el APK ni ejecutado la validación física de esta fase; tampoco se ha desplegado ni hecho commit.
