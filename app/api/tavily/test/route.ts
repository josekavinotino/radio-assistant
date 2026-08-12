import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
};

type TavilyResponse = {
  answer?: string;
  results?: TavilySearchResult[];
  query?: string;
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

export async function POST(request: Request) {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    return jsonResponse(
      { error: "La búsqueda de Tavily no está configurada en el servidor." },
      500
    );
  }

  let query = "¿Cuál es la capital de Francia?";

  try {
    const body = await request.json();
    if (body && typeof body.query === "string" && body.query.trim() !== "") {
      query = body.query;
    }
  } catch {
    // Cuerpo vacío o no válido: se usa la consulta por defecto.
  }

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return jsonResponse(
        { error: "No se ha podido realizar la búsqueda en Tavily." },
        502
      );
    }

    const payload = (await response.json()) as TavilyResponse;

    const results = (payload.results ?? []).map((result) => ({
      title: result.title ?? null,
      url: result.url ?? null,
      content: result.content ?? null,
    }));

    return jsonResponse({
      query: payload.query ?? query,
      answer: payload.answer ?? null,
      results,
    });
  } catch {
    return jsonResponse(
      { error: "No se ha podido conectar con el servicio de búsqueda." },
      502
    );
  }
}