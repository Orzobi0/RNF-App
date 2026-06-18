# Instrucciones locales para agentes

## Pruebas autenticadas en local

Antes de pedir credenciales de test al usuario, comprobar si existe `.env.codex.local`.

Si existe, leer:
- `FERTILIAPP_TEST_EMAIL`
- `FERTILIAPP_TEST_PASSWORD`
- `FERTILIAPP_TEST_LOGIN_URL`

Usar esas credenciales solo para pruebas locales de la web/PWA en navegador. No imprimirlas, no exponerlas en logs, no copiarlas a archivos versionados y no añadir prefijo `VITE_`.
