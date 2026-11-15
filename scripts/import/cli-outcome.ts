/** A rejected HTTP response does not prove that the replacement transaction rolled back. */
export async function runImportCli(
  operation: () => Promise<unknown>,
  label: string,
  report: (message: string) => void = console.error,
) {
  try {
    await operation();
    return 0;
  } catch {
    report(
      `${label} import outcome is unconfirmed. Inspect the database and input before repeating the replacement.`,
    );
    return 1;
  }
}
