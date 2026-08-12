import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Source = {
  title?: unknown;
  content?: unknown;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): NextResponse {
  return NextResponse.json(body, { status, headers: JSON_HEADERS });
}

function extractAnswer(payload: {
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string | null {
  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") {
        return part.text;
      }
    }
  }
  return null;
}

function buildPrompt(question: string, sources: Source[]): string {
  const baseInstructions =
    "Responde exclusivamente a la pregunta. No inventes información. " +
    "Si no puedes determinar la respuesta, dilo. " +
    "Responde de forma extremadamente breve, idealmente con el dato que necesita el concursante. " +
    "No añadas explicaciones innecesarias. Responde en español.";

  if (sources.length === 0) {
    return `${baseInstructions}\n\nPregunta: ${question}`;
  }

  const sourceText = sources
    .map((source, index) => {
      const title = typeof source.title === "string" ? source.title : "";
      const content =
        typeof source.content === "string" ? source.content : "";
      return `Fuente ${index + 1}${title ? ` (${title})` : ""}:\n${content}`;
    })
    .join("\n\n");

  return (
    "Responde exclusivamente a la pregunta. " +
    "Utiliza las fuentes proporcionadas como contexto principal. " +
    "No inventes información. Si las fuentes no permiten determinar la respuesta, dilo. " +
    "Responde de forma extremadamente breve, idealmente con el dato que necesita el concursante. " +
    "No añadas explicaciones innecesarias. Responde en español.\n\n" +
    `Pregunta: ${question}\n\nFuentes:\n${sourceText}`
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return jsonResponse(
      { error: "La consulta de OpenAI no está configurada en el servidor." },
      500
    );
  }

  let body: { question?: unknown; sources?: unknown };

  try {
    body = (await request.json()) as { question?: unknown; sources?: unknown };
  } catch {
    return jsonResponse({ error: "Se esperaba un JSON válido." }, 400);
  }

  if (typeof body.question !== "string" || body.question.trim() === "") {
    return jsonResponse(
      {
        error:
          "El campo 'question' es obligatorio y debe ser un string no vacío.",
      },
      400
    );
  }

  const question = body.question;

  let sources: Source[] = [];
  if (body.sources !== undefined) {
    if (!Array.isArray(body.sources)) {
      return jsonResponse(
        { error: "El campo 'sources' debe ser un array." },
        400
      );
    }
    sources = body.sources as Source[];
  }

  const prompt = buildPrompt(question, sources);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        max_output_tokens: 2048,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return jsonResponse(
        { error: "No se ha podido realizar la consulta en OpenAI." },
        502
      );
    }

    const payload = (await response.json()) as {
      output?: Array<{
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };

    const answer = extractAnswer(payload);

    if (answer === null) {
      return jsonResponse(
        { error: "OpenAI no ha devuelto una respuesta válida." },
        502
      );
    }

    return jsonResponse({ question, answer });
  } catch {
    return jsonResponse(
      { error: "No se ha podido conectar con el servicio de OpenAI." },
      502
    );
  }
}