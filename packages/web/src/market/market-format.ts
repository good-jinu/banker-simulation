export function money(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
