import { NextResponse } from "next/server";

export async function GET() {
  const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8080";

  try {
    const response = await fetch(`${backendUrl}/health`, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ status: "error", detail: "backend respondeu com erro" }, { status: 502 });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ status: "error", detail: "backend indisponível" }, { status: 503 });
  }
}
