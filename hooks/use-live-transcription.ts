"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DeepgramMessage,
  DeepgramResultsMessage,
  DeepgramTokenPayload,
  SegmentedQuestion,
} from "@/lib/deepgram-types";
import { QuestionSegmenter } from "@/lib/question-segmenter";
import { TranscriptBuffer } from "@/lib/transcript-buffer";

const AUDIO_MIME_TYPE = "audio/webm;codecs=opus";
const DEEPGRAM_URL = new URL("wss://api.deepgram.com/v1/listen");

DEEPGRAM_URL.search = new URLSearchParams({
  model: "nova-3",
  language: "es",
  interim_results: "true",
  punctuate: "true",
  endpointing: "400",
}).toString();

export type TranscriptionStatus =
  | "idle"
  | "requesting-microphone"
  | "connecting"
  | "listening"
  | "stopping"
  | "error";

export type AnswerResult = {
  questionId: string;
  question: string;
  answer: string;
  loading: boolean;
  error?: string;
};

function appendSegment(current: string, segment: string) {
  return current ? `${current} ${segment}` : segment;
}

function getErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "No se ha podido acceder al micrófono. Comprueba los permisos del navegador.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "No se ha podido iniciar la transcripción.";
}

function isResultsMessage(message: DeepgramMessage): message is DeepgramResultsMessage {
  return message.type === "Results";
}

function getSafeDiagnosticText(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  if (/(api[ _-]?key|authorization|bearer|credential|token)/i.test(value)) {
    return "Motivo oculto por seguridad.";
  }

  return value.trim().slice(0, 300);
}

function getDeepgramErrorMessage(message: DeepgramMessage) {
  const errorMessage = message as {
    err_code?: unknown;
    err_msg?: unknown;
  };
  const code =
    typeof errorMessage.err_code === "string" ? errorMessage.err_code : null;
  const reason = getSafeDiagnosticText(
    errorMessage.err_msg,
    "Deepgram no proporcionó un motivo."
  );

  return `Deepgram informó un error${code ? ` (${code})` : ""}: ${reason}`;
}

export function useLiveTranscription() {
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [error, setError] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [speechFinal, setSpeechFinal] = useState(false);
  const [segmentedQuestions, setSegmentedQuestions] = useState<SegmentedQuestion[]>([]);
  const [answerResults, setAnswerResults] = useState<AnswerResult[]>([]);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef(0);
  const stoppingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const segmenterTimerRef = useRef<number | null>(null);
  const deepgramErrorRef = useRef("");
  const transcriptBufferRef = useRef(new TranscriptBuffer());
  const questionSegmenterRef = useRef(new QuestionSegmenter());
  const sentQuestionIdsRef = useRef(new Set<string>());

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearSegmenterTimer = useCallback(() => {
    if (segmenterTimerRef.current !== null) {
      window.clearTimeout(segmenterTimerRef.current);
      segmenterTimerRef.current = null;
    }
  }, []);

  const requestAnswer = useCallback((question: SegmentedQuestion) => {
    const trimmed = question.text.trim();
    if (!trimmed) {
      return;
    }

    if (sentQuestionIdsRef.current.has(question.id)) {
      return;
    }
    sentQuestionIdsRef.current.add(question.id);

    setAnswerResults((current) => [
      ...current,
      { questionId: question.id, question: trimmed, answer: "", loading: true },
    ]);

    fetch("/api/answer/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        question: trimmed,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("answer_http");
        }
        return response.json() as Promise<{
          question?: unknown;
          answer?: unknown;
        }>;
      })
      .then((data) => {
        const answer = data.answer;
        if (typeof answer !== "string") {
          throw new Error("answer_invalid");
        }

        setAnswerResults((current) =>
          current.map((result) =>
            result.questionId === question.id
              ? { ...result, answer, loading: false }
              : result
          )
        );
      })
      .catch(() => {
        setAnswerResults((current) =>
          current.map((result) =>
            result.questionId === question.id
              ? {
                  ...result,
                  loading: false,
                  error: "No se ha podido obtener la respuesta.",
                }
              : result
          )
        );
      });
  }, []);

  const publishQuestions = useCallback(
    (questions: SegmentedQuestion[]) => {
      if (questions.length > 0) {
        setSegmentedQuestions((current) => [...current, ...questions]);
        questions.forEach((question) => requestAnswer(question));
      }
    },
    [requestAnswer]
  );

  const scheduleSegmenterFlush = useCallback(() => {
    clearSegmenterTimer();
    segmenterTimerRef.current = window.setTimeout(() => {
      publishQuestions(questionSegmenterRef.current.flush(Date.now()));
      segmenterTimerRef.current = null;
    }, 750);
  }, [clearSegmenterTimer, publishQuestions]);

  const stopTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "CloseStream" }));
      socket.close();
    } else if (socket && socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }

    socketRef.current = null;
  }, []);

  const resetResources = useCallback(() => {
    clearCloseTimer();
    clearSegmenterTimer();

    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    stopTracks();
    closeSocket();
  }, [clearCloseTimer, clearSegmenterTimer, closeSocket, stopTracks]);

  const handleResults = useCallback((message: DeepgramResultsMessage) => {
    const transcript = message.channel.alternatives[0]?.transcript.trim();

    if (transcript) {
      if (message.is_final) {
        setFinalTranscript((current) => appendSegment(current, transcript));
        setInterimTranscript("");
      } else {
        setInterimTranscript(transcript);
      }
    }

    setSpeechFinal(message.speech_final);
    const update = transcriptBufferRef.current.process(message, Date.now());

    if (update.stableSegment) {
      publishQuestions(questionSegmenterRef.current.addSegment(update.stableSegment));
    }

    if (message.speech_final) {
      questionSegmenterRef.current.markPause(Date.now());
      scheduleSegmenterFlush();
    }
  }, [publishQuestions, scheduleSegmenterFlush]);

  const start = useCallback(async () => {
    if (status === "requesting-microphone" || status === "connecting" || status === "listening") {
      return;
    }

    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)) {
      setStatus("error");
      setError("Este navegador no admite audio WebM con Opus para la transcripción.");
      return;
    }

    resetResources();
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    stoppingRef.current = false;
    setError("");
    setInterimTranscript("");
    setFinalTranscript("");
    setSpeechFinal(false);
    setSegmentedQuestions([]);
    deepgramErrorRef.current = "";
    transcriptBufferRef.current.reset();
    questionSegmenterRef.current.reset();
    sentQuestionIdsRef.current.clear();
    clearSegmenterTimer();
    setStatus("requesting-microphone");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (sessionRef.current !== session) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: AUDIO_MIME_TYPE });
      mediaRecorderRef.current = recorder;

      setStatus("connecting");
      const tokenResponse = await fetch("/api/deepgram/token", {
        method: "POST",
        cache: "no-store",
      });
      const tokenPayload = (await tokenResponse.json()) as DeepgramTokenPayload & {
        error?: string;
      };

      if (!tokenResponse.ok || !tokenPayload.accessToken) {
        throw new Error(tokenPayload.error ?? "No se ha podido obtener un token temporal.");
      }

      if (sessionRef.current !== session) {
        return;
      }

      const socket = new WebSocket(DEEPGRAM_URL, ["bearer", tokenPayload.accessToken]);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size === 0 || socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(event.data);
      });

      recorder.addEventListener("stop", () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "Finalize" }));
          closeTimerRef.current = window.setTimeout(closeSocket, 1500);
        }
      });

      socket.addEventListener("open", () => {
        if (sessionRef.current !== session || stoppingRef.current) {
          socket.close();
          return;
        }

        recorder.start(250);
        setStatus("listening");
      });

      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data as string) as DeepgramMessage;

          if (isResultsMessage(message)) {
            handleResults(message);
          } else if (message.type === "UtteranceEnd") {
            publishQuestions(questionSegmenterRef.current.markUtteranceEnd());
          } else if (message.type === "Error") {
            const deepgramError = getDeepgramErrorMessage(message);
            deepgramErrorRef.current = deepgramError;
            setError(deepgramError);
            setStatus("error");
          }
        } catch {
          setError("Deepgram ha enviado un mensaje de diagnóstico no válido.");
          setStatus("error");
        }
      });

      socket.addEventListener("error", () => {
        if (sessionRef.current === session && !stoppingRef.current) {
          console.error("Deepgram WebSocket error.");
          setError(
            "Se ha producido un error de WebSocket con Deepgram. Esperando detalles de cierre..."
          );
          setStatus("error");
        }
      });

      socket.addEventListener("close", (event) => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        if (sessionRef.current === session && stoppingRef.current) {
          publishQuestions(questionSegmenterRef.current.flush(Date.now(), true));
          mediaRecorderRef.current = null;
          setStatus("idle");
        } else if (sessionRef.current === session) {
          stopTracks();
          mediaRecorderRef.current = null;
          const reason = getSafeDiagnosticText(
            event.reason,
            "No proporcionado."
          );
          const closeDiagnostic = `Deepgram cerró la conexión. Código: ${event.code}. Motivo: ${reason}. Cierre limpio: ${event.wasClean ? "sí" : "no"}.`;
          const deepgramError = deepgramErrorRef.current;

          console.error(closeDiagnostic);
          setError(
            deepgramError
              ? `${deepgramError} ${closeDiagnostic}`
              : closeDiagnostic
          );
          setStatus("error");
        }
      });
    } catch (caughtError) {
      if (sessionRef.current === session) {
        resetResources();
        setStatus("error");
        setError(getErrorMessage(caughtError));
      }
    }
  }, [clearSegmenterTimer, closeSocket, handleResults, publishQuestions, resetResources, status, stopTracks]);

  const stop = useCallback(() => {
    if (status === "idle" || status === "error") {
      resetResources();
      setStatus("idle");
      return;
    }

    if (status === "requesting-microphone" || status === "connecting") {
      sessionRef.current += 1;
      stoppingRef.current = true;
      resetResources();
      setStatus("idle");
      return;
    }

    stoppingRef.current = true;
    setStatus("stopping");
    setInterimTranscript("");
    stopTracks();

    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }

    closeSocket();
    mediaRecorderRef.current = null;
    setStatus("idle");
  }, [closeSocket, resetResources, status, stopTracks]);

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      stoppingRef.current = true;
      resetResources();
    };
  }, [resetResources]);

  return {
    status,
    error,
    interimTranscript,
    finalTranscript,
      speechFinal,
    segmentedQuestions,
    answerResults,
    start,
    stop,
  };
}
