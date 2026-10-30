import { NextRequest, NextResponse } from "next/server";
import { getCreators } from "@/lib/db";
import Papa from "papaparse";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get("format") || "csv").toLowerCase();

    // Fetch all creators
    const { creators } = await getCreators({ limit: 1000, sortBy: "name", sortOrder: "asc" });

    const rows = creators.map((c) => ({
      "Creator Name": c.name,
      "Address": c.address || "",
      "Email": c.email || "",
      "Phone": c.phone || "",
      "PAN Number": c.pan || "",
      "Bank Name": c.bank_name || "",
      "Bank Account Number": c.bank_account || "",
      "IFSC Code": c.ifsc || "",
      "Account Holder Name": c.account_holder || c.name,
      "UPI ID": c.upi_id || "",
      "MSME Registered (YES/NO)": c.is_msme ? "YES" : "NO",
      "MSME UDYAM Registration No": c.msme_registration_no || "",
    }));

    const dateStr = new Date().toISOString().split("T")[0];

    if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 24 }, // Name
        { wch: 38 }, // Address
        { wch: 25 }, // Email
        { wch: 18 }, // Phone
        { wch: 14 }, // PAN
        { wch: 18 }, // Bank Name
        { wch: 22 }, // Bank Account No
        { wch: 14 }, // IFSC
        { wch: 24 }, // Account Holder
        { wch: 22 }, // UPI
        { wch: 18 }, // MSME
        { wch: 24 }, // UDYAM
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Creators");
      const rawBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const buffer = Buffer.from(rawBuf);

      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="Dermalist_Creators_${dateStr}.xlsx"`,
          "Content-Length": buffer.length.toString(),
        },
      });
    }

    const csvContent = Papa.unparse(rows);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Dermalist_Creators_${dateStr}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("Creators export error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to export creators." },
      { status: 500 }
    );
  }
}
