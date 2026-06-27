// Renders a JSON-LD <script>. `data` is always a server-constructed plain object, but it can carry
// CMS-authored strings (event name/note, etc.), so escape the script-terminator (`<`, which also
// covers `</script>` and `<!--`) and the JSON-legal-but-JS-illegal line separators (U+2028/U+2029)
// before injection to prevent markup breakout.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replaceAll(String.fromCharCode(0x2028), "\\u2028")
    .replaceAll(String.fromCharCode(0x2029), "\\u2029");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
