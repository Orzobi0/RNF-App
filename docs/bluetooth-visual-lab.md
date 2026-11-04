# Previsualización Bluetooth integrada en FertiliApp

Ejecutar `npm run dev` y abrir **http://localhost:5174/?visualLab=1**. Arranca siempre FertiliApp normal con su autenticación Firebase Staging, proveedores, cuenta, datos, Dashboard, gráfica, registros, ajustes y navegación existentes.

Después de acceder a la cuenta aparece el botón plegable **Laboratorio BLE**, por encima de la navegación inferior. El modo inicial es **Web/PWA**: no muestra Bluetooth. Elegir **Android visual** añade únicamente las vistas Bluetooth simuladas sobre la pantalla actual. El selector conserva el modo y el escenario al navegar dentro de la aplicación; recargar inicia una nueva previsualización si la URL mantiene el parámetro.

El panel permite minimizarse y desactivarse. **Desactivar modo visual** retira los componentes simulados y elimina `visualLab` de la URL sin ir a otra página. Para activarlo otra vez, abrir la página local con `?visualLab=1`. Usar las herramientas responsive de Chrome para cambiar de anchura.

Escenarios: sin vincular, desconectado, buscando, conectando, escuchando, no encontrado, error de conexión, incidencia horaria, una o varias pendientes, tarjeta minimizada/expandida, fecha fuera de rango, posible duplicado, guardando, incorporación correcta, varias incorporaciones y resultado incierto.

## Separación de la simulación

Solo se sustituye el valor del contexto Bluetooth. Los proveedores de autenticación y ciclos permanecen intactos. La previsualización usa las mismas vistas del menú, tarjeta de pendientes, revisión, avisos y diálogo horario. Buscar, vincular, revisar, incorporar y ajustar el reloj modifican solo estado ficticio en memoria. No se importa un adaptador nativo o Firestore en el módulo de simulación. El callback de incorporación real se rechaza sin ejecutarlo. Las páginas normales siguen usando Firebase Staging y sus funciones habituales.

La activación exige desarrollo Vite, modo Staging, hostname localhost/127.0.0.1, parámetro explícito y plataforma no nativa. Se requiere una cuenta autenticada para montar la previsualización. La importación del módulo se elimina del build publicado. No funciona en Hosting, Experiment, producción ni APK. Los cambios de cuenta reinician los datos ficticios.

Se han retirado el lienzo independiente, el iframe, el marco de teléfono, la cabecera ficticia, los tamaños y áreas seguras artificiales y el arranque alternativo en `main.jsx`. No hay usuarios, ciclos, registros ni rutas de demostración. Se retiró también el antiguo parámetro `blePreview`, reemplazado por el único acceso explícito `visualLab=1`.

## Límites y comprobación

Las simulaciones no verifican Bluetooth, suspensión Android, Firestore ni sincronización física del reloj. El aviso ficticio de incorporación no significa que exista una nueva temperatura en Mis registros. Ver día utiliza la navegación normal, pero no crea el registro ficticio.

Verificado en Chrome con una sesión Staging existente recuperada: Dashboard auténtico, alternancia Web/Android, menú de tres acciones, pendientes sobre el Dashboard, expansión/cancelación, navegación a Registros/Gráfica/Ajustes conservando el selector, aviso de éxito ficticio y desactivación sin Bluetooth ni panel. No se realizó un inicio de sesión nuevo introduciendo credenciales ni escrituras normales de prueba, para conservar la sesión y los registros existentes.

Pruebas unitarias incluyen aislamiento por entorno, identidad de los children de la aplicación, conservación al navegar, cambio de cuenta, simulación local y rechazo de cualquier callback de guardado real.
