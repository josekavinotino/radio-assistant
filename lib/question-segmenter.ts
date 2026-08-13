import type {
  DeepgramWord,
  SegmentedQuestion,
  TranscriptSegment,
} from "@/lib/deepgram-types";

const PAUSE_GRACE_MS = 700;
const SILENCE_GAP_SECONDS = 0.6;

type CompletionReason = SegmentedQuestion["completedBy"];

type QuestionBuffer = {
  textParts: string[];
  words: DeepgramWord[];
  start: number;
  end: number;
  confidenceTotal: number;
  confidenceCount: number;
};

function normalizeText(text: string) {
  return text.toLocaleLowerCase("es").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function countWords(text: string) {
  return normalizeText(text).split(" ").filter(Boolean).length;
}

function hasQuestionPunctuation(text: string) {
  return /[?？]/.test(text);
}

function hasQuestionSignal(text: string) {
  return /^(?:que|qué|cual|cuál|quien|quién|cuando|cuándo|donde|dónde|como|cómo|por que|por qué|en que|en qué|a que|a qué|cuanto|cuánto|cuanta|cuánta|cuantos|cuántos|cuantas|cuántas)\b/i.test(
    text.trim()
  );
}

function getText(buffer: QuestionBuffer) {
  return buffer.textParts.join(" ").replace(/\s+([?!,.;:])/g, "$1").trim();
}

function isMeaningfulQuestion(text: string) {
  const words = countWords(text);
  const letters = normalizeText(text).replace(/\s/g, "").length;

  return (
    words >= 3 ||
    letters >= 16 ||
    (hasQuestionPunctuation(text) && words >= 2) ||
    (hasQuestionSignal(text) && words >= 2)
  );
}

function splitAtQuestionPunctuation(segment: TranscriptSegment) {
  if (!hasQuestionPunctuation(segment.text)) {
    return [{ ...segment, endsWithQuestionPunctuation: false }];
  }

  const textParts = segment.text.match(/[^?？]+[?？]?/g) ?? [segment.text];
  if (textParts.length < 2 && !segment.words.length) {
    return [{ ...segment, endsWithQuestionPunctuation: true }];
  }

  const chunks: Array<TranscriptSegment & { endsWithQuestionPunctuation: boolean }> = [];
  let wordIndex = 0;

  for (const textPart of textParts) {
    const chunkWords: DeepgramWord[] = [];
    while (wordIndex < segment.words.length) {
      const word = segment.words[wordIndex++];
      chunkWords.push(word);
      if (/[?？]/.test(word.punctuated_word ?? word.word)) {
        break;
      }
    }

    const start = chunkWords[0]?.start ?? segment.start;
    const end = chunkWords.at(-1)?.end ?? segment.end;
    const confidences = chunkWords
      .map((word) => word.confidence)
      .filter((value): value is number => typeof value === "number");

    chunks.push({
      ...segment,
      text: textPart.trim(),
      words: chunkWords,
      start,
      end,
      confidence:
        confidences.length > 0
          ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
          : segment.confidence,
      endsWithQuestionPunctuation: /[?？]\s*$/.test(textPart),
    });
  }

  return chunks;
}

export class QuestionSegmenter {
  private current?: QuestionBuffer;
  private pauseAt?: number;
  private nextId = 1;
  private emittedTexts = new Set<string>();

  reset() {
    this.current = undefined;
    this.pauseAt = undefined;
    this.nextId = 1;
    this.emittedTexts.clear();
  }

  addSegment(segment: TranscriptSegment) {
    const emitted: SegmentedQuestion[] = [];
    const chunks = splitAtQuestionPunctuation(segment);

    for (const chunk of chunks) {
      if (
        this.current &&
        chunk.start - this.current.end >= SILENCE_GAP_SECONDS &&
        isMeaningfulQuestion(getText(this.current))
      ) {
        const question = this.emit("silence");
        if (question) {
          emitted.push(question);
        }
      }

      this.pauseAt = undefined;
      this.append(chunk);

      if (chunk.endsWithQuestionPunctuation && this.current && isMeaningfulQuestion(getText(this.current))) {
        const question = this.emit("punctuation");
        if (question) {
          emitted.push(question);
        }
      }
    }

    return emitted;
  }

  markPause(at: number) {
    if (this.current) {
      this.pauseAt = at;
    }
  }

  markUtteranceEnd() {
    if (!this.current) {
      return [];
    }

    if (!isMeaningfulQuestion(getText(this.current))) {
      // El buffer no contiene una pregunta significativa: se descarta.
      this.current = undefined;
      this.pauseAt = undefined;
      return [];
    }

    const question = this.emit("speech_final");
    return question ? [question] : [];
  }

  flush(now: number, force = false) {
    if (!this.current || !isMeaningfulQuestion(getText(this.current))) {
      return [];
    }

    if (!force && (!this.pauseAt || now - this.pauseAt < PAUSE_GRACE_MS)) {
      return [];
    }

    const question = this.emit("speech_final");
    return question ? [question] : [];
  }

  private append(segment: TranscriptSegment) {
    const confidence = segment.confidence;
    if (!this.current) {
      this.current = {
        textParts: [segment.text],
        words: [...segment.words],
        start: segment.start,
        end: segment.end,
        confidenceTotal: typeof confidence === "number" ? confidence : 0,
        confidenceCount: typeof confidence === "number" ? 1 : 0,
      };
      return;
    }

    const currentText = normalizeText(getText(this.current));
    const segmentText = normalizeText(segment.text);
    if (segmentText && currentText.endsWith(segmentText)) {
      return;
    }

    this.current.textParts.push(segment.text);
    this.current.words.push(...segment.words);
    this.current.end = Math.max(this.current.end, segment.end);
    if (typeof confidence === "number") {
      this.current.confidenceTotal += confidence;
      this.current.confidenceCount += 1;
    }
  }

  private emit(completedBy: CompletionReason) {
    if (!this.current) {
      return undefined;
    }

    const text = getText(this.current);
    const fingerprint = normalizeText(text);
    const buffer = this.current;
    this.current = undefined;
    this.pauseAt = undefined;

    if (!fingerprint || this.emittedTexts.has(fingerprint)) {
      return undefined;
    }

    this.emittedTexts.add(fingerprint);
    return {
      id: `question-${this.nextId++}`,
      text,
      start: buffer.start,
      end: buffer.end,
      confidence:
        buffer.confidenceCount > 0
          ? buffer.confidenceTotal / buffer.confidenceCount
          : undefined,
      completedBy,
    };
  }
}
