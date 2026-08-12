import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TavilySearchResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
};

type TavilyResponse = {
  results?: TavilySearchResult[];
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

function buildPrompt(question: string, results: TavilySearchResult[]): string {
  const instructions = [
    "La pregunta del usuario es la pregunta que debe responderse exactamente.",
    "Los resultados de búsqueda son contexto y evidencia, no una respuesta automática.",
    "Compara los resultados entre sí antes de responder.",
    "Prioriza fuentes fiables y especializadas frente a resultados de baja calidad, redes sociales o contenido SEO poco fiable.",
    "Presta especial atención a preguntas que puedan tener diferentes interpretaciones.",
    "Si existen dos respuestas posibles debido a una diferencia de definición, territorio, periodo histórico, unidad de medida o criterio, analiza cuál corresponde exactamente a la formulación de la pregunta.",
    "No asumas que el primer resultado es correcto.",
    "No elijas una respuesta únicamente porque aparezca más veces.",
    "Para preguntas de cultura general, concursos, historia, geografía, ciencia, música, cine o televisión, busca la respuesta que normalmente se considera correcta para la formulación concreta de la pregunta.",
    "Si las fuentes presentan información contradictoria, resuelve la contradicción utilizando las fuentes más fiables y el significado exacto de la pregunta.",
    "Si la pregunta tiene una respuesta convencional claramente esperada, prioriza esa respuesta.",
    "Responde exclusivamente a la pregunta.",
    "No inventes información que no esté suficientemente respaldada.",
    "Si los resultados no permiten determinar la respuesta con suficiente seguridad, indícalo.",
    "Responde en español.",
    "No introduzcas una explicación larga. La salida debe ser extremadamente breve.",
    "Si la respuesta es un nombre, devuelve el nombre.",
    "Si la respuesta es un año, devuelve el año.",
    "Si la respuesta es una cifra, devuelve la cifra.",
    "Si la respuesta es un lugar, devuelve el lugar.",
    "Si la respuesta necesita una frase corta, devuelve únicamente esa frase.",
    'No comiences nunca con "La respuesta es...", "Según las fuentes...", "De acuerdo con..." ni "Probablemente...".',
    "No menciones Tavily, OpenAI ni las fuentes en la respuesta final.",
  ].join("\n");

  const resultsText = results
    .map((result, index) => {
      const title = typeof result.title === "string" ? result.title : "";
      const content =
        typeof result.content === "string" ? result.content : "";
      return `Resultado ${index + 1}${title ? ` (${title})` : ""}:\n${content}`;
    })
    .join("\n\n");

  return `${instructions}\n\nPregunta:\n${question}\n\nResultados de búsqueda:\n${resultsText}`;
}

async function searchTavily(
  apiKey: string,
  question: string
): Promise<TavilySearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: question,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return Promise.reject(new Error("tavily_http"));
  }

  const payload = (await response.json()) as TavilyResponse;
  return payload.results ?? [];
}

async function askOpenAI(
  apiKey: string,
  question: string,
  results: TavilySearchResult[]
): Promise<string> {
  const prompt = buildPrompt(question, results);

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
    return Promise.reject(new Error("openai_http"));
  }

  const payload = (await response.json()) as {
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  const answer = extractAnswer(payload);

  if (answer === null) {
    return Promise.reject(new Error("openai_invalid"));
  }

  return answer;
}

export async function POST(request: Request) {
  let body: { question?: unknown };

  try {
    body = (await request.json()) as { question?: unknown };
  } catch {
    return jsonResponse({ error: "Se esperaba un JSON válido." }, 400);
  }

  if (typeof body.question !== "string" || body.question.trim() === "") {
    return jsonResponse({ error: "La pregunta es obligatoria." }, 400);
  }

  const question = body.question;

  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    return jsonResponse(
      { error: "TAVILY_API_KEY no está configurada." },
      500
    );
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return jsonResponse(
      { error: "OPENAI_API_KEY no está configurada." },
      500
    );
  }

  let results: TavilySearchResult[];
  try {
    results = await searchTavily(tavilyApiKey, question);
  } catch (error) {
    const message =
      error instanceof Error && error.message === "tavily_http"
        ? "No se ha podido realizar la búsqueda en Tavily."
        : "No se ha podido conectar con el servicio de búsqueda.";
    return jsonResponse({ error: message }, 502);
  }

  let answer: string;
  try {
    answer = await askOpenAI(openaiApiKey, question, results);
  } catch (error) {
    const message =
      error instanceof Error && error.message === "openai_http"
        ? "No se ha podido realizar la consulta en OpenAI."
        : "No se ha podido conectar con el servicio de OpenAI.";
    return jsonResponse({ error: message }, 502);
  }

  return jsonResponse({ question, answer });
}