/** Apply house punctuation without changing archived metadata or file bytes. */
export function displayText(value: string | null | undefined) {
  return (value ?? "").replaceAll("\u2014", "-");
}
