# Metadatos Bluetooth (A)

`users/{uid}/preferences/thermometer_{deviceKey}` contiene `kind`, `deviceKey` y `fields`. Cada campo permitido conserva valor, fecha de edición en milisegundos y revisión opaca. Las transacciones combinan campos sin borrar respuestas parciales; prevalece la fecha mayor y, en empate, la revisión. La migración local usa fecha 0 para no sustituir cambios remotos. Los relojes de los móviles determinan el orden de ediciones concurrentes, sin intentar identificar dispositivos físicos entre móviles.

Firestore aporta lectura en caché. Como sus transacciones requieren red, `fertiliapp:thermometer-metadata:v1:{uid}` conserva primero el cambio y una bandeja de salida por cuenta. Se reintenta al abrir, recuperar conectividad, recibir una instantánea del servidor o editar. No se hacen consultas BLE periódicas. Un fallo conserva la edición y muestra aviso. Las reglas existentes de preferencias del propietario son suficientes y no se modifican.

Lista permitida: nombre personalizado/comercial/anunciado, modelo, fabricante, protocolo, compatibilidad, firmware/software, batería y fechas de consulta, volumen/modo/unidad. No se sincronizan MAC, serial, vinculaciones, selección, escucha, pendientes ni intentos. Los metadatos no autorizan Bluetooth. Desvincular no borra metadatos históricos. `customName: null` significa eliminación voluntaria; un campo ausente permite recurrir a `device_custom_name` conservado en la medición.

# Primera incorporación (C)

El identificador nativo de lectura basta aunque falte fecha original. La fecha confirmada se guarda separadamente. La lectura promovida debe persistir en pendientes antes de iniciar el guardado manual existente; duplicados e incertidumbre pasan a esa revisión. La primera lectura concede 15 minutos de revisión, sin prórrogas por nuevas lecturas. Cancelar, desconectar o cambiar cuenta invalida la evidencia. Solo se suprimen reenvíos exactos con fecha original y evidencia no ambigua; sin ella, la comparación por fecha confirmada solo señala posibles duplicados, nunca elimina tomas.
