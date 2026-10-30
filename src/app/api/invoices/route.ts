import { NextRequest, NextResponse } from "next/server";
import { getInvoices, createInvoice } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const creatorId = searchParams.get("creatorId") ? parseInt(searchParams.get("creatorId")!, 10) : undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const data = await getInvoices({ search, creatorId, limit, offset });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("GET /api/invoices error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch invoices." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body?.invoice_number) {
      return NextResponse.json({ error: "Invoice number is required." }, { status: 400 });
    }
    if (!body?.creator_name) {
      return NextResponse.json({ error: "Creator name is required." }, { status: 400 });
    }

    const invoice = await createInvoice(body);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/invoices error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save invoice record." },
      { status: 500 }
    );
  }
}
