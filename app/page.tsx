"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveTranscription } from "@/hooks/use-live-transcription";

type RowStatus = "empty" | "active" | "passed" | "answered";

type QuestionRow = {
  questionId?: string;
  text?: string;
  status: RowStatus;
};

const TOTAL_QUESTIONS = 10;
const EMPTY_ROWS: QuestionRow[] = Array.from({ length: TOTAL_QUESTIONS }, () => ({
  status: "empty",
}));

export default function Home() {
  const {
    status,
    error,
    interimTranscript,
    finalTranscript,
    speechFinal,
    segmentedQuestions,
    answerResults,
    start,
    stop,
  } = useLiveTranscription();

  const [rows, setRows] = useState<QuestionRow[]>(EMPTY_ROWS);
  const assignedQuestionIdsRef = useRef<Set<string>>(new Set());

  const [testQuestion, setTestQuestion] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    const pending = segmentedQuestions.filter(
      (question) => !assignedQuestionIdsRef.current.has(question.id)
    );

    if (pending.length === 0) {
      return;
    }

    setRows((current) => {
      const next = [...current];
      let assigned = false;

      for (const question of pending) {
        const index = next.findIndex((row) => row.status === "empty");
        if (index === -1) {
          break;
        }

        next[index] = {
          questionId: question.id,
          text: question.text,
          status: "active",
        };
        assignedQuestionIdsRef.current.add(question.id);
        assigned = true;
      }

      return assigned ? next : current;
    });
  }, [segmentedQuestions]);

  const listening = status === "listening" || status === "stopping";
  const microphoneReady = status === "listening" || status === "stopping";
  const connectionLabel = {
    idle: "DESCONECTADO",
    "requesting-microphone": "SOLICITANDO PERMISO",
    connecting: "CONECTANDO",
    listening: "CONECTADO",
    stopping: "FINALIZANDO",
    error: "ERROR",
  }[status];

  const filledCount = rows.filter((row) => row.status !== "empty").length;

  function toggleListening() {
    if (listening || status === "connecting" || status === "requesting-microphone") {
      stop();
      return;
    }

    start();
  }

  function handlePass(index: number) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index && row.status === "active"
          ? { ...row, status: "passed" as const }
          : row
      )
    );
  }

  async function testAnswer(question: string) {
    const response = await fetch("/api/answer/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ question }),
    });

    if (!response.ok) {
      throw new Error("La petición no se ha completado correctamente.");
    }

    return (await response.json()) as { question: string; answer: string };
  }

  async function handleTestAnswer() {
    const question = testQuestion.trim();

    if (!question) {
      setTestError("Escribe una pregunta.");
      setTestResult(null);
      return;
    }

    setTestLoading(true);
    setTestError(null);
    setTestResult(null);

    try {
      const result = await testAnswer(question);
      setTestResult(result.answer);
    } catch {
      setTestError("No se ha podido obtener la respuesta.");
    } finally {
      setTestLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4">
      <div className="mx-auto max-w-md">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Radio Assistant</h1>

          <p className="text-sm text-gray-400">
            Asistente para concurso de preguntas
          </p>
        </header>

        <section className="mb-6 rounded-2xl bg-gray-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-400">
              Estado
            </span>

            <span
              className={`text-sm font-medium ${
                microphoneReady
                  ? "text-green-400"
                  : "text-gray-400"
              }`}
            >
              {microphoneReady
                ? "MICRÓFONO ACTIVO"
                : status === "requesting-microphone"
                  ? "SOLICITANDO PERMISO"
                  : "DETENIDO"}
            </span>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-400">Deepgram</span>
            <span
              className={`text-sm font-medium ${
                status === "listening"
                  ? "text-green-400"
                  : status === "error"
                    ? "text-red-400"
                    : "text-gray-400"
              }`}
            >
              {connectionLabel}
            </span>
          </div>

          <button
            onClick={toggleListening}
            className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-gray-950"
          >
            {listening || status === "connecting" || status === "requesting-microphone"
              ? "Detener escucha"
              : "Iniciar escucha"}
          </button>

          {error && (
            <p className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}
        </section>

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Preguntas
            </h2>

            <span className="text-sm text-gray-400">
              {filledCount} / {TOTAL_QUESTIONS}
            </span>
          </div>

          <div className="space-y-2">
            {rows.map((row, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 rounded-xl p-3 ${
                  row.status === "passed"
                    ? "border border-amber-500/50 bg-amber-950/40"
                    : "bg-gray-900"
                }`}
              >
                <span className="w-6 text-sm text-gray-500">
                  {index + 1}
                </span>

                <div className="flex-1">
                  {row.text ? (
                    <p className="text-sm text-gray-100">{row.text}</p>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Esperando pregunta...
                    </p>
                  )}

                  {row.status === "passed" && (
                    <p className="mt-0.5 text-xs font-medium text-amber-400">
                      EN SEGUNDA VUELTA
                    </p>
                  )}

                  {row.status === "answered" && (
                    <p className="mt-0.5 text-xs font-medium text-green-400">
                      RESPONDIDA
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handlePass(index)}
                  disabled={row.status !== "active"}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    row.status === "passed"
                      ? "border-amber-500/50 text-amber-400"
                      : row.status === "active"
                        ? "border-gray-700 text-gray-300 hover:border-gray-500"
                        : "cursor-not-allowed border-gray-800 text-gray-600"
                  }`}
                >
                  {row.status === "passed" ? "PASO ✓" : "PASO"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-2xl bg-gray-900 p-4">
          <h2 className="mb-3 text-lg font-semibold">Probar respuesta</h2>

          <input
            type="text"
            value={testQuestion}
            onChange={(event) => setTestQuestion(event.target.value)}
            placeholder="Escribe una pregunta..."
            className="mb-3 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
          />

          <button
            onClick={handleTestAnswer}
            disabled={testLoading}
            className="w-full rounded-xl bg-white px-4 py-3 font-semibold text-gray-950 disabled:opacity-50"
          >
            {testLoading ? "PROBANDO..." : "PROBAR RESPUESTA"}
          </button>

          {testError && (
            <p className="mt-3 text-sm text-red-400">
              {testError}
            </p>
          )}

          {testResult !== null && (
            <div className="mt-3 rounded-xl bg-gray-950 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Respuesta
              </p>
              <p className="mt-1 text-sm text-gray-100">
                {testResult}
              </p>
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl bg-gray-900 p-4">
          <h2 className="mb-3 text-lg font-semibold">RESPUESTAS</h2>

          {answerResults.length === 0 ? (
            <p className="text-sm text-gray-500">
              Esperando preguntas...
            </p>
          ) : (
            <div className="space-y-3">
              {answerResults.map((result, index) => (
                <div key={result.questionId} className="rounded-xl bg-gray-950 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Pregunta {index + 1}
                    </p>

                    {result.loading && (
                      <span className="text-xs text-gray-400">
                        Buscando respuesta...
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-gray-100">
                    {result.question}
                  </p>

                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Respuesta
                  </p>

                  {result.loading ? (
                    <p className="mt-1 text-sm text-gray-400">
                      Buscando respuesta...
                    </p>
                  ) : result.error ? (
                    <p className="mt-1 text-sm text-red-400">
                      No se ha podido obtener la respuesta.
                    </p>
                  ) : (
                    <p className="mt-1 text-base font-semibold text-green-400">
                      {result.answer}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-gray-900 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Transcripción en directo</h2>
            {speechFinal && (
              <span className="text-xs font-medium text-green-400">
                PAUSA DETECTADA
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Texto final
              </p>
              <p className="min-h-6 text-sm text-gray-100">
                {finalTranscript || "Esperando transcripción..."}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Texto provisional
              </p>
              <p className="text-sm italic text-gray-400">
                {interimTranscript || "..."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}