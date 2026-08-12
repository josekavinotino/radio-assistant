import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeepgramTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

export async function POST() {
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "La transcripción no está configurada en el servidor." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "No se ha podido iniciar la transcripción." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const payload = (await response.json()) as DeepgramTokenResponse;

    if (typeof payload.access_token !== "string") {
      return NextResponse.json(
        { error: "Deepgram no ha devuelto un token válido." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        accessToken: payload.access_token,
        expiresIn:
          typeof payload.expires_in === "number" ? payload.expires_in : 30,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "No se ha podido conectar con el servicio de transcripción." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
