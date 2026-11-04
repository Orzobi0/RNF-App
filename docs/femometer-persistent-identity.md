# Identificación local del BM-Vinca2 (Android Staging)

## Contrato opaco persistente (implementación actual)

`FemometerIdentityStore` conserva en SharedPreferences `femometer_identity_v2`
una asociación por UID: dirección privada + UUID aleatorio. V2 es autoritativo.
La primera consulta migra la dirección antigua de `femometer_identity_v1` y
confirma el UUID antes de devolverlo. Si falla la escritura no se devuelve una
identidad temporal como si fuera persistente. Después se limpia el valor antiguo.

Recordar la misma dirección conserva el UUID. Reemplazarla genera otro UUID.
Olvidar guarda una marca vacía (tombstone), para que una interrupción durante la
migración nunca resucite la asociación antigua. Volver a vincular después de
olvidar genera una identidad nueva, incluso con la misma dirección. Las cuentas
no comparten UUID. No se identifica por nombre ni por modelo.

`getRememberedDevice` / `rememberDevice` devuelven `remembered` y `deviceKey`.
`startTemperatureListener` recibe UID + identificador temporal de escaneo;
Android resuelve la dirección desde su mapa privado y solo adjunta `deviceKey`
si coincide con la vinculación de esa cuenta. La clave se captura en el callback
GATT de esa conexión. Los eventos de otra conexión no heredan la clave actual.
El resultado de escucha y las respuestas del reloj incluyen la misma clave.
JavaScript no envía una clave para que el nativo la acepte.

No se permite cambiar/olvidar la vinculación durante una escucha activa. La
sesión compartida mantiene su límite de escucha y limpia el GATT al cambiar de
cuenta. El UID sigue procediendo de la sesión autenticada web, como en fase 1;
no se introduce autenticación Firebase nativa.

El UUID identifica una **vinculación local**, no un número de serie universal.
Si el dispositivo cambia su dirección BLE (pila, firmware, dirección privada),
la coincidencia deja de funcionar y requiere inspección y revinculación manual.
No se reconoce arbitrariamente otro BM-Vinca2 como el anterior. No se exponen
ni se registran direcciones, UUID o UID en logs.

### Prueba física de esta fase

1. Usar una vinculación antigua y consultar Dispositivos: debe migrar sin volver
   a seleccionar el termómetro. Recibir dos temperaturas vinculadas.
2. Reiniciar la APK y después Android: los dos pendientes deben reaparecer,
   separados de cualquier otra cuenta. Apagar/encender el termómetro y reconectar.
3. Sincronizar y comprobar que Dispositivos conserva la última verificación al
   reabrir. Una lectura posterior correcta debe mostrarse como lectura, no ajuste.
4. Revisar ambas tomas dentro de la tarjeta, corregir una fecha, minimizar,
   reabrir desde el icono y guardar. Solo la toma confirmada desaparece y se
   selecciona la siguiente. «Ver día» abre exactamente su DayDetail.
5. Detener, olvidar y volver a vincular: no debe heredarse la confianza del reloj.
   Los pendientes antiguos se conservan como otra vinculación, nunca se reasignan.
6. Interrumpir un guardado: al reabrir debe quedar incierto, exigir comprobar el
   registro y no reintentarse automáticamente. Probar retransmisiones y la
   confirmación adicional de una medición realmente distinta.
7. Cambiar de cuenta y repetir. Sin permisos/BT activo no deben perderse pendientes.

No se ha validado físicamente el cambio de dirección tras sustituir la pila.


La preferencia privada `femometer_identity_v1` asocia el UID de la sesión con la dirección BLE vista por Android. El UID procede de AuthContext: no se añade autenticación nativa ni almacenamiento en Firestore. Es separación local por cuenta dentro de la app, no una nueva frontera de autorización frente a código que controle el puente web.

El puente permite consultar la existencia de la asociación, recordar un identificador temporal y olvidar la asociación de esa cuenta. Para guardar, el dispositivo debe proceder del escaneo actual y haber superado la inspección nativa: servicio Health Thermometer, característica Temperature Measurement con indicaciones y descriptor CCCD. No basta el nombre anunciado ni un booleano enviado por JavaScript. Las respuestas nunca contienen la dirección. Los errores nativos no incluyen excepciones completas en logs, que podrían contener identificadores Bluetooth.

Cada búsqueda sigue generando identificadores públicos temporales. `isRemembered` indica coincidencia exacta con la dirección guardada para el UID solicitado. La selección de una coincidencia no inicia conexión: comprobar compatibilidad y escuchar siguen siendo acciones manuales. Sin coincidencia, una cuenta con asociación no recibe una selección alternativa automática. Los errores de permisos, Bluetooth apagado y búsqueda sin resultados no eliminan la preferencia. Consultar y olvidar no requieren Bluetooth encendido ni permisos BLE.

El panel se remonta al cambiar el UID y consulta la asociación al abrirse. Olvidar elimina solo la entrada de esa cuenta; no borra dispositivos visibles ni lecturas de diagnóstico. La función se bloquea fuera del entorno web Staging y de Android nativo, y las operaciones BLE y de persistencia también comprueban el identificador del paquete Android Staging. No hay conexión automática ni escritura de temperaturas.

## Limitaciones

No se ha comprobado físicamente si el BM-Vinca2 mantiene su dirección al apagarse o usa direcciones privadas rotatorias. Si cambia, esta fase no puede reconocerlo: mostrará el guardado como no encontrado y permitirá buscar, comprobar y recordar manualmente el dispositivo nuevo. No se deduce identidad por nombre, señal o servicios compartidos. La coincidencia de dirección tampoco equivale a autenticación criptográfica del hardware.

La asociación sobrevive al cierre del proceso; borrar los datos de la app elimina las preferencias. No se ha modificado la política existente de copias de seguridad Android (`allowBackup`), por lo que una restauración del sistema puede restaurarlas. No existe sincronización de esta asociación mediante Firebase.

La configuración existente de Capacitor carga `https://fertiliapp-staging.web.app`. Compilar/sincronizar el APK no publica los cambios del panel en ese servidor. Para validar el flujo completo, el dispositivo necesita cargar esta versión del frontend mediante un entorno de pruebas autorizado o un despliegue posterior explícito. Esta tarea no modifica esa configuración ni despliega.

## Validación pendiente con Android y termómetro físico

1. Con cuenta A, buscar y seleccionar manualmente. Antes de comprobar compatibilidad no debe poder recordarse; una llamada directa con ID inexistente o no verificado debe rechazarse.
2. Comprobar compatibilidad, recordar, forzar cierre desde Android y reabrir con A. Debe mostrarse la asociación antes de buscar, sin abrir GATT automáticamente.
3. Buscar: debe marcarse el recordado. Apagar y encender el BM-Vinca2 y repetir varias veces. Anotar solo si coincide/no coincide (sin publicar direcciones). Una falta de coincidencia por sí sola no prueba rotación: comprobar también que el dispositivo anuncia y que los permisos funcionan.
4. Apagar Bluetooth, denegar permisos y buscar sin el termómetro. La asociación debe conservarse; al restablecer las condiciones, repetir la búsqueda.
5. Si hay otro BM-Vinca2 y el recordado no está presente, no debe seleccionarse el otro automáticamente como recordado. Seleccionarlo y comprobarlo manualmente antes de reemplazar la asociación.
6. Cambiar a cuenta B: no debe ver la asociación de A. Volver a A: debe conservarse. Olvidar con Bluetooth apagado, forzar cierre y reabrir: A ya no debe tener asociación.
7. Comprobar que búsqueda, inspección y recepción diagnóstica de varias temperaturas siguen funcionando, sin crear registros.

Las pruebas Node validan el transporte del puente, los flags de coincidencia, la propagación de errores y el bloqueo en producción/PWA. No sustituyen estas pruebas físicas ni prueban por sí solas la persistencia real de SharedPreferences.

## Ejecución del 29 de octubre de 2026

- `npm run check:staging`: correcto.
- `npm run test:staging`: 4 pruebas correctas.
- `npm run build:staging`: correcto.
- `node --test scripts/femometer-bridge.test.mjs scripts/android-ui.test.mjs`: 3 pruebas correctas; aviso no fatal de puerto WebSocket 24678 ocupado.
- `npm run sync:staging:android`: correcto.
- `assembleDebug` con `CAPACITOR_ENV=staging`, JDK de Android Studio2 y Gradle 9.2.0 instalado: BUILD SUCCESSFUL. El wrapper del proyecto (9.7.1) falla por incompatibilidad con Android Gradle Plugin 8.13.2 antes de compilar el código. No se ha modificado el wrapper ni el plugin.
- No se han ejecutado las pruebas físicas enumeradas arriba. No se ha instalado el APK, desplegado ni creado un commit.
