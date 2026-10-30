import { NextRequest, NextResponse } from "next/server";
import { generateInvoiceExcelBuffer, InvoiceExcelPayload } from "@/lib/excel";

export async function POST(req: NextRequest) {
  try {
    const body: InvoiceExcelPayload = await req.json();

    if (!body?.invoice_number || !body?.creator?.name) {
      return NextResponse.json(
        { error: "Invoice number and creator details are required." },
        { status: 400 }
      );
    }

    const buffer = await generateInvoiceExcelBuffer(body);

    const safeCreatorName = (body.creator.name || "Creator").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeCreatorName}_Invoice_${body.invoice_number.replace(/\//g, "_")}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("Export Excel error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate Excel workbook." },
      { status: 500 }
    );
  }
}
