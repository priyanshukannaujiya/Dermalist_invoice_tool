import { NextRequest, NextResponse } from "next/server";
import { generateSampleCsv, generateSampleXlsx } from "@/lib/creator-importer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "csv").toLowerCase();

    if (format === "xlsx") {
      const buffer = generateSampleXlsx();
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="Dermalist_Creators_Template.xlsx"',
          "Content-Length": buffer.length.toString(),
        },
      });
    }

    const csvContent = generateSampleCsv();
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="Dermalist_Creators_Template.csv"',
      },
    });
  } catch (error: any) {
    console.error("Template generation error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate template file." },
      { status: 500 }
    );
  }
}
