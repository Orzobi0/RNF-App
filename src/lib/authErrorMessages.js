const AUTH_ERROR_MESSAGES = {
  'auth/invalid-credential': 'Correo o contraseña incorrectos.',
  'auth/wrong-password': 'Correo o contraseña incorrectos.',
  'auth/user-not-found': 'Correo o contraseña incorrectos.',
  'auth/invalid-email': 'El correo no tiene un formato válido.',
  'auth/email-already-in-use':
    'Ya existe una cuenta con este correo. Inicia sesión o restablece la contraseña.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/too-many-requests': 'Demasiados intentos. Prueba de nuevo más tarde.',
  'auth/network-request-failed': 'No hay conexión o la red es inestable.',
  'auth/requires-recent-login':
    'Por seguridad, vuelve a iniciar sesión antes de hacer este cambio.',
  'auth/expired-action-code': 'El enlace ha caducado. Solicita uno nuevo.',
  'auth/invalid-action-code': 'El enlace no es válido o ya se ha usado.',
  'auth/no-current-user': 'Vuelve a iniciar sesión antes de hacer este cambio.',
};

export const getAuthErrorMessage = (
  error,
  fallback = 'No se pudo completar la acción. Inténtalo de nuevo.'
) => {
  const code = error?.code || error?.message;
  return AUTH_ERROR_MESSAGES[code] || fallback;
};
