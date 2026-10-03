export interface SensingTranscriptSegment {
  id: string;
  text: string;
}

/** Number literal excerpts, preserving ASR wording and punctuation. */
export function sensingTranscriptSegments(
  transcript: string,
): SensingTranscriptSegment[] {
  const segments: SensingTranscriptSegment[] = [];
  const sentences = transcript.matchAll(
    /[^\n。！？!?；;]*[。！？!?；;]+|[^\n。！？!?；;]+/gu,
  );
  for (const [sentence] of sentences) {
    const text = sentence.trim();
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 220, text.length);
      // Do not split a Unicode surrogate pair at the excerpt limit.
      if (
        end < text.length &&
        /[\uD800-\uDBFF]/u.test(text[end - 1]) &&
        /[\uDC00-\uDFFF]/u.test(text[end])
      )
        end--;
      const excerpt = text.slice(start, end).trim();
      if (excerpt)
        segments.push({ id: `S${segments.length + 1}`, text: excerpt });
      start = end;
    }
  }
  return segments;
}
