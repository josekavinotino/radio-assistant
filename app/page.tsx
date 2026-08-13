"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveTranscription } from "@/hooks/use-live-transcription";

type CardEditStatus = "idle" | "loading" | "done" | "error";

type QuestionCard = {
  questionId: string;
  originalText: string;
  editableText: string;
  isEditing: boolean;
  editStatus: CardEditStatus;
  editedAnswer: string;
  passed: boolean;
};

export default function Home() {
  const {
    status,
    error,
    segmentedQuestions,
    answerResults,
    start,
    stop,
  } = useLiveTranscription();

  const [cards, setCards] = useState<QuestionCard[]>([]);
  const assignedQuestionIdsRef = useRef<Set<string>>(new Set());

  const isListening =
    status === "requesting-microphone" ||
    status === "connecting" ||
    status === "listening" ||
    status === "stopping";

  useEffect(() => {
    const pending = segmentedQuestions.filter(
      (question) => !assignedQuestionIdsRef.current.has(question.id)
    );

    if (pending.length === 0) {
      return;
    }

    for (const question of pending) {
      assignedQuestionIdsRef.current.add(question.id);
    }

    setCards((current) => [
      ...current,
      ...pending.map((question) => ({
        questionId: question.id,
        originalText: question.text,
        editableText: question.text,
        isEditing: false,
        editStatus: "idle" as const,
        editedAnswer: "",
        passed: false,
      })),
    ]);
  }, [segmentedQuestions]);

  function toggleListening() {
    if (isListening) {
      stop();
      return;
    }

    setCards([]);
    assignedQuestionIdsRef.current.clear();
    start();
  }

  function handleEdit(questionId: string) {
    setCards((current) =>
      current.map((card) =>
        card.questionId === questionId
          ? { ...card, isEditing: true, editStatus: "idle" }
          : card
      )
    );
  }

  function handleTextChange(questionId: string, text: string) {
    setCards((current) =>
      current.map((card) =>
        card.questionId === questionId
          ? { ...card, editableText: text }
          : card
      )
    );
  }

  async function requestAnswer(question: string) {
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

  function handleConfirmEdit(questionId: string) {
    const card = cards.find((item) => item.questionId === questionId);
    if (!card || !card.isEditing) {
      return;
    }

    const nextText = card.editableText.trim();
    const edited = Boolean(nextText) && nextText !== card.originalText;

    setCards((current) =>
      current.map((item) =>
        item.questionId === questionId
          ? {
              ...item,
              isEditing: false,
              ...(edited
                ? { editStatus: "loading" as const, editedAnswer: "" }
                : {}),
            }
          : item
      )
    );

    if (!edited) {
      return;
    }

    requestAnswer(nextText)
      .then((result) => {
        setCards((current) =>
          current.map((item) =>
            item.questionId === questionId
              ? { ...item, editStatus: "done", editedAnswer: result.answer }
              : item
          )
        );
      })
      .catch(() => {
        setCards((current) =>
          current.map((item) =>
            item.questionId === questionId
              ? { ...item, editStatus: "error" }
              : item
          )
        );
      });
  }

  function handlePass(questionId: string) {
    setCards((current) =>
      current.map((card) =>
        card.questionId === questionId ? { ...card, passed: true } : card
      )
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-4">
      <div className="mx-auto max-w-xl">
        <section className="mb-6 flex items-center justify-center gap-3">
          {isListening && (
            <span
              className="h-4 w-4 animate-pulse rounded-full bg-red-500"
              aria-hidden="true"
            />
          )}

          <button
            onClick={toggleListening}
            className="rounded-xl bg-white px-6 py-3 font-semibold text-gray-950"
          >
            {isListening ? "DETENER ESCUCHA" : "INICIAR ESCUCHA"}
          </button>
        </section>

        {error && (
          <p className="mb-4 rounded-xl bg-red-950/40 px-4 py-2 text-center text-sm text-red-400">
            {error}
          </p>
        )}

        <section>
          {cards.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              Pulsa INICIAR ESCUCHA para empezar a detectar preguntas.
            </p>
          ) : (
            <div className="space-y-4">
              {cards.map((card, index) => {
                const answerResult = answerResults.find(
                  (result) => result.questionId === card.questionId
                );

                let answerNode;
                if (card.editStatus === "loading") {
                  answerNode = (
                    <p className="text-sm text-gray-400">
                      Buscando respuesta...
                    </p>
                  );
                } else if (card.editStatus === "error") {
                  answerNode = (
                    <p className="text-sm text-red-400">
                      No se ha podido obtener la respuesta.
                    </p>
                  );
                } else if (card.editedAnswer) {
                  answerNode = (
                    <p className="text-base font-semibold text-green-400">
                      {card.editedAnswer}
                    </p>
                  );
                } else if (answerResult?.loading) {
                  answerNode = (
                    <p className="text-sm text-gray-400">
                      Buscando respuesta...
                    </p>
                  );
                } else if (answerResult?.error) {
                  answerNode = (
                    <p className="text-sm text-red-400">
                      {answerResult.error}
                    </p>
                  );
                } else if (answerResult?.answer) {
                  answerNode = (
                    <p className="text-base font-semibold text-green-400">
                      {answerResult.answer}
                    </p>
                  );
                } else {
                  answerNode = (
                    <p className="text-sm text-gray-500">
                      Esperando respuesta...
                    </p>
                  );
                }

                return (
                  <div
                    key={card.questionId}
                    className={`rounded-2xl p-4 ${
                      card.passed
                        ? "border border-amber-500/50 bg-amber-950/40"
                        : "bg-gray-900"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Pregunta {index + 1}
                      </span>
                    </div>

                    {card.isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        value={card.editableText}
                        onChange={(event) =>
                          handleTextChange(card.questionId, event.target.value)
                        }
                        onBlur={() => handleConfirmEdit(card.questionId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleConfirmEdit(card.questionId);
                          }
                        }}
                        className="w-full rounded-xl border border-gray-600 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                      />
                    ) : (
                      <p
                        role="button"
                        tabIndex={0}
                        onClick={() => handleEdit(card.questionId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            handleEdit(card.questionId);
                          }
                        }}
                        className="cursor-pointer rounded-xl bg-gray-950 px-3 py-2 text-sm text-gray-100"
                      >
                        {card.editableText}
                      </p>
                    )}

                    <div className="mt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Respuesta
                      </p>
                      <div className="mt-1 min-h-6">{answerNode}</div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      {card.isEditing && (
                        <button
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleConfirmEdit(card.questionId)}
                          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-gray-950"
                        >
                          ACTUALIZAR
                        </button>
                      )}

                      <button
                        onClick={() => handlePass(card.questionId)}
                        disabled={card.passed}
                        className={`rounded-lg border px-4 py-1.5 text-xs font-semibold ${
                          card.passed
                            ? "cursor-not-allowed border-amber-500/50 text-amber-400"
                            : "border-gray-600 text-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {card.passed ? "PASADO" : "PASO"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}