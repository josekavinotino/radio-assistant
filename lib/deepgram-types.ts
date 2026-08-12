export type DeepgramWord = {
  word: string;
  start?: number;
  end?: number;
  confidence?: number;
  punctuated_word?: string;
};

export type DeepgramAlternative = {
  transcript: string;
  confidence: number;
  words?: DeepgramWord[];
};

export type DeepgramResultsMessage = {
  type: "Results";
  start?: number;
  duration?: number;
  channel_index?: number[];
  channel: {
    alternatives: DeepgramAlternative[];
  };
  is_final: boolean;
  speech_final: boolean;
  from_finalize?: boolean;
};

export type TranscriptSegment = {
  text: string;
  start: number;
  end: number;
  confidence?: number;
  words: DeepgramWord[];
  speechFinal: boolean;
  receivedAt: number;
};

export type SegmentedQuestion = {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence?: number;
  completedBy: "speech_final" | "punctuation" | "silence";
};

export type DeepgramUtteranceEndMessage = {
  type: "UtteranceEnd";
  channel: number[];
  last_word_end: number;
};

export type DeepgramMetadataMessage = {
  type: "Metadata";
  request_id: string;
};

export type DeepgramMessage =
  | DeepgramResultsMessage
  | DeepgramUtteranceEndMessage
  | DeepgramMetadataMessage
  | { type: string };

export type DeepgramTokenPayload = {
  accessToken: string;
  expiresIn: number;
};
