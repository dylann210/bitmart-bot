export async function syncTableToSheets(
  url: string,
  table: string,
  columns: string[],
  rows: unknown[]
): Promise<void> {
  const data = (rows as Record<string, unknown>[]).map((row) => columns.map((col) => row[col] ?? ''));

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table, columns, rows: data }),
  });
}
