# Persistencia de sesión robusta (web/PWA)

## Problema real
En web/PWA móvil, la persistencia de Firebase Auth basada en IndexedDB/localStorage puede perderse por limpieza del navegador, presión de almacenamiento o políticas del SO. Eso puede provocar que `onIdTokenChanged` entregue `null` tras horas/días de inactividad aunque la usuaria no haya hecho logout.

## Qué hace ahora la app
Se mantiene el enfoque actual de persistencia cliente (`authPersistenceReady`, fallback local, `ensurePersistentStorage`) y se añade una **capa de restauración silenciosa** desde backend basada en cookie HttpOnly.

## Flujo nuevo

### Login (email/password)
1. `login` espera `authPersistenceReady`.
2. Hace `signInWithEmailAndPassword`.
3. Obtiene `idToken` y llama `POST /api/sessionLogin` con `credentials: 'include'`.
4. Backend valida token y crea cookie `__session` HttpOnly.

### Restore silencioso
1. En bootstrap, si `onIdTokenChanged` devuelve `null`, no redirige de inmediato.
2. Intenta una sola vez `GET /api/sessionRestore`.
3. Si responde `customToken`, hace `signInWithCustomToken`.
4. Luego refresca cookie con `POST /api/sessionLogin` usando nuevo ID token.
5. Si responde 401, continúa como no autenticada sin toasts intrusivos.

### Logout manual
1. `logout` llama `POST /api/sessionLogout`.
2. Limpia cookie backend.
3. Ejecuta `signOut(auth)`.
4. Evita restore inmediato en ese mismo flujo.

## Endpoints backend nuevos
Todos bajo same-origin `/api/**` (Firebase Hosting rewrite):

- `POST /api/sessionLogin`
  - Input: `{ idToken }`
  - Output: `{ ok: true }`
- `POST /api/sessionLogout`
  - Output: `{ ok: true }`
- `GET /api/sessionRestore`
  - Output éxito: `{ ok: true, customToken }`
  - Error controlado: `401 { ok: false, code }`
- `GET /api/sessionMe`
  - Output éxito: `{ ok: true, uid, email }`
  - Error controlado: `401 { ok: false, code }`

## Cookie / seguridad
La cookie de sesión se configura con:
- `HttpOnly`
- `Secure`
- `SameSite=Lax`
- `Path=/`
- `Max-Age=14 días`

> Nota: en Firebase Hosting la cookie de sesión se maneja con nombre `__session` para compatibilidad de forwarding a Functions.

## Limitaciones conocidas
- No existe “sesión infinita” garantizada en cliente web/PWA.
- Si expira o se invalida la cookie backend, se requerirá login normal.
- Si no hay red en el arranque y no existe estado Firebase local, no se puede restaurar hasta recuperar conectividad.

## Same-origin y hosting
Se usa rewrite de Hosting `/api/** -> function: sessionApi` para evitar problemas de cookies entre dominios (`cloudfunctions.net` vs `web.app`).

## Telemetría añadida
Se añadieron eventos de diagnóstico para distinguir:
- transición usuario autenticado -> `null`
- restore silencioso OK / 401 / error de red
- revalidaciones por `boot`, `foreground`, `pageshow`, `logout`, `unexpected_null`
- contexto: standalone, `visibilityState`, inactividad, `navigator.storage.persisted()`

## Pruebas manuales recomendadas
1. **Login normal**
   - Iniciar sesión y validar que `/api/sessionMe` devuelve `ok: true`.
2. **Cerrar/reabrir app**
   - Mantener sesión sin pedir credenciales.
3. **Perder estado cliente con cookie válida**
   - Limpiar storage local (IndexedDB/localStorage) sin borrar cookies y recargar: debe restaurar sin pantalla de login.
4. **Logout manual**
   - Ejecutar logout y recargar: no debe restaurar automáticamente.
5. **Cookie caducada/inválida**
   - Simular cookie inválida y recargar: debe ir a login limpio sin errores visuales agresivos.
6. **Fallo de red**
   - Simular offline temporal durante restore: no forzar logout agresivo ni romper la UI.
7. **Host canónico**
   - Abrir desde `*.firebaseapp.com`: redirección a `*.web.app` para evitar sesiones duplicadas por origen distinto.