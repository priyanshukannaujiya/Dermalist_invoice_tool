import { NextRequest, NextResponse } from "next/server";
import { parseInvoiceWithGroq } from "@/lib/groq";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Prompt is required and must be non-empty." },
        { status: 400 }
      );
    }

    const result = await parseInvoiceWithGroq(prompt.trim());
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("API /api/parse-invoice error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to parse invoice with AI." },
      { status: 500 }
    );
  }
}
