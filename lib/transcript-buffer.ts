import type {
  DeepgramResultsMessage,
  DeepgramWord,
  TranscriptSegment,
} from "@/lib/deepgram-types";

export type TranscriptBufferUpdate = {
  stableSegment?: TranscriptSegment;
};

function normalizeText(text: string) {
  return text.toLocaleLowerCase("es").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function getWordTime(words: DeepgramWord[], key: "start" | "end") {
  const values = words
    .map((word) => word[key])
    .filter((value): value is number => typeof value === "number");

  if (values.length === 0) {
    return undefined;
  }

  return key === "start" ? Math.min(...values) : Math.max(...values);
}

function getConfidence(words: DeepgramWord[], fallback?: number) {
  const confidences = words
    .map((word) => word.confidence)
    .filter((value): value is number => typeof value === "number");

  if (confidences.length === 0) {
    return fallback;
  }

  return confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
}

function makeSegment(
  message: DeepgramResultsMessage,
  receivedAt: number
): TranscriptSegment | undefined {
  const alternative = message.channel.alternatives[0];
  const text = alternative?.transcript.trim();

  if (!text) {
    return undefined;
  }

  const words = alternative.words ?? [];
  const start = getWordTime(words, "start") ?? message.start ?? 0;
  const end =
    getWordTime(words, "end") ??
    (typeof message.start === "number" && typeof message.duration === "number"
      ? message.start + message.duration
      : start);

  return {
    text,
    start,
    end,
    confidence: getConfidence(words, alternative.confidence),
    words,
    speechFinal: message.speech_final,
    receivedAt,
  };
}

function shouldUseInterim(finalSegment: TranscriptSegment, interim: TranscriptSegment) {
  const finalText = normalizeText(finalSegment.text);
  const interimText = normalizeText(interim.text);

  return (
    finalText.length > 0 &&
    interimText.length > finalText.length &&
    interimText.endsWith(finalText) &&
    (interim.end >= finalSegment.start || finalSegment.end >= interim.start)
  );
}

export class TranscriptBuffer {
  private latestInterim?: TranscriptSegment;
  private seenSegmentKeys = new Set<string>();

  reset() {
    this.latestInterim = undefined;
    this.seenSegmentKeys.clear();
  }

  process(
    message: DeepgramResultsMessage,
    receivedAt: number
  ): TranscriptBufferUpdate {
    const segment = makeSegment(message, receivedAt);

    if (!segment) {
      return {};
    }

    if (!message.is_final) {
      this.latestInterim = segment;
      return {};
    }

    const stableSegment =
      this.latestInterim && shouldUseInterim(segment, this.latestInterim)
        ? {
            ...this.latestInterim,
            speechFinal: message.speech_final,
            receivedAt,
          }
        : segment;
    this.latestInterim = undefined;

    const key = `${stableSegment.start}:${stableSegment.end}:${normalizeText(stableSegment.text)}`;
    if (this.seenSegmentKeys.has(key)) {
      return {};
    }

    this.seenSegmentKeys.add(key);
    if (this.seenSegmentKeys.size > 200) {
      this.seenSegmentKeys.clear();
      this.seenSegmentKeys.add(key);
    }

    return { stableSegment };
  }
}
