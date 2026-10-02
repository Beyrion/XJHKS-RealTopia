export function sanitizeText(value: string) {
  return value
    .replace(/[<>&"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
