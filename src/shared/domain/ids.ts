const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route params are user input: check the shape before they reach a UUID column (Postgres throws otherwise). */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
