# Recepción automática Vinca 2 — Android Staging

La sesión pertenece a la cuenta autenticada y se comparte entre páginas. La búsqueda de dispositivos vinculados admite hasta 25 segundos y termina al encontrar la identidad correcta. No se amplía la compatibilidad ni se solicitan permisos automáticamente.

## Recuperación de lecturas

- Al abrir la aplicación se conecta al termómetro vinculado mediante el flujo existente.
- Al volver a primer plano se renueva ordenadamente la conexión Vinca 2, aunque figurase escuchando. Un margen de cinco segundos evita ráfagas por eventos duplicados; una operación GATT en curso conserva la exclusión.
- `VINCA2_RECOVERY_CHECK_MS` define una comprobación interna cada 60 segundos. No hay nueva preferencia visible.
- La alternativa actual es **reconectar**, no repetir escrituras en una conexión activa. `0x2A21` es Measurement Interval: el código y la observación física solo acreditan la escritura `01 00` durante la preparación. No acreditan que sea un comando de históricos repetible.
- Mientras la conexión sigue activa, se espera la ventana original de seis minutos (`VINCA2_RECOVERY_RECONNECT_MS`) antes de renovarla. Por ello una medición nueva puede tardar aproximadamente seis o siete minutos en recuperarse si la aplicación permanece abierta. Volver a primer plano permite recuperarla antes. No se promete recuperación de datos cada minuto.
- Una desconexión real permite recuperación en la siguiente comprobación. Tras fallos consecutivos, las esperas aumentan; se detiene tras tres intentos fallidos. Volver a primer plano o usar Conectar permite un nuevo intento. Los temporizadores desaparecen al suspender, detener expresamente o cerrar la sesión.
- Reloj, configuración, búsqueda, cierre e incorporación al servidor excluyen la recuperación simultánea. La captura de observación del reloj no se interrumpe con renovaciones periódicas.
- Cada reconexión utiliza la suscripción, normalización y ruta de pendientes/guardado existentes. Las posibles retransmisiones permanecen sujetas a comprobación local y del historial del servidor; nunca se consideran nuevos registros solo por haberse recibido otra vez.

## Reloj y automatización

Automática requiere consentimiento `v2`. Al activarla se lee el reloj y, si falta una referencia válida del historial nuevo, se sincroniza una vez y se verifica. La referencia solo sirve para mediciones posteriores. Al conectar de nuevo se lee: un reloj correcto conserva la referencia; un desfase superior a 120 segundos o una fecha imposible permite una corrección verificada. No se escribe el reloj a intervalos fijos. La captura de diagnóstico mantiene la prohibición nativa de sincronizar.

Una lectura idéntica del reloj tras más de cinco segundos en la misma conexión se trata como una posible instantánea fija, no como evidencia de desfase. No habilita confianza nueva: se vuelve a comprobar en una conexión distinta. Las incidencias reales se conservan; una sincronización correctiva establece el inicio de un intervalo nuevo.

Las lecturas automáticas siguen requiriendo fecha original de hoy/ayer, comprobaciones anteriores y posteriores, ausencia de incidencias relevantes, ciclo inequívoco, comprobación de duplicados y confirmación de Firebase. Los errores indican si falta sincronización, la medición es anterior a ella, la fecha es dudosa, existe una coincidencia o no se pudo consultar el servidor. Un resultado de guardado incierto no se reintenta automáticamente.

## Elección de modo y navegación

El primer guardado manual validado registra `automationPrompt: pending` en la misma transacción. `shown` significa pregunta sin resolver, no consentimiento. Tras recarga o navegación se puede recuperar; solo Manual o Automática con consentimiento `v2` completan la elección. Las preferencias anteriores se respetan.

Añadir abre solo el asistente visual. Buscar detiene la recepción antes de usar BLE. Cancelar o salir limpia el cambio de dispositivo y recupera la sesión vinculada cuando puede hacerlo. El dashboard ofrece Conectar cuando está desconectado y mantiene los bloqueos de operaciones reales.

## Pendiente de comprobar físicamente

Confirmar recuperación tras desbloquear y a lo largo de varias ventanas de seis minutos, corrección y lectura del reloj, ausencia de incorporaciones repetidas, fallos/offline y restauración del asistente. La repetición de `0x2A21` queda sin habilitar hasta disponer de evidencia física suficiente. Las pruebas automatizadas usan transportes y Firebase simulados; no acreditan comportamiento del firmware.
