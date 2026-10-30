import { NextResponse } from "next/server";
import { getNextInvoiceNumber } from "@/lib/db";

export async function GET() {
  try {
    const nextNumber = await getNextInvoiceNumber();
    return NextResponse.json({ nextInvoiceNumber: nextNumber });
  } catch (error: any) {
    return NextResponse.json({ nextInvoiceNumber: "DL-001" });
  }
}
