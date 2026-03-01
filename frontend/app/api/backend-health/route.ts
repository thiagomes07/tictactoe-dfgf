import { NextResponse } from "next/server";

import { fetchHealth } from "@/lib/api/health";
import { ApiClientError } from "@/lib/api/http-client";

export async function GET() {
  try {
    const health = await fetchHealth();
    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    if (error instanceof ApiClientError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            requestId: error.requestId
          }
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "UNKNOWN_ERROR",
          message: "Falha ao consultar backend"
        }
      },
      { status: 503 }
    );
  }
}
