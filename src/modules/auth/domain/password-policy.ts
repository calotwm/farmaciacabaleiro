export const MIN_PASSWORD_LENGTH = 10;
/** argon2 handles long inputs, but an upper bound prevents hashing-DoS payloads. */
export const MAX_PASSWORD_LENGTH = 128;

/** Returns Spanish error messages (empty array when the password is acceptable). */
export function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`La contraseña no puede superar los ${MAX_PASSWORD_LENGTH} caracteres.`);
  }
  if (password.trim().length === 0) {
    errors.push("La contraseña no puede estar vacía.");
  }
  return errors;
}
