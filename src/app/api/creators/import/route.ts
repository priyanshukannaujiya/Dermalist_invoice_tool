import { NextRequest, NextResponse } from "next/server";
import { parseCreatorCsv, parseCreatorExcel, normalizeRawRow } from "@/lib/creator-importer";
import { bulkUpsertCreators, Creator } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let creatorsToSave: Partial<Creator>[] = [];
    let fileSummary: any = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
      }

      const fileName = file.name.toLowerCase();
      const arrayBuffer = await file.arrayBuffer();

      if (fileName.endsWith(".csv")) {
        const text = new TextDecoder().decode(arrayBuffer);
        const parsed = parseCreatorCsv(text);
        fileSummary = parsed;
        creatorsToSave = parsed.validRows.map((r) => ({
          name: r.name,
          address: r.address || null,
          email: r.email || null,
          phone: r.phone || null,
          pan: r.pan || null,
          bank_name: r.bank_name || null,
          bank_account: r.bank_account || null,
          ifsc: r.ifsc || null,
          account_holder: r.account_holder || r.name,
          upi_id: r.upi_id || null,
          is_msme: Boolean(r.is_msme),
          msme_registration_no: r.msme_registration_no || null,
        }));
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const parsed = parseCreatorExcel(Buffer.from(arrayBuffer));
        fileSummary = parsed;
        creatorsToSave = parsed.validRows.map((r) => ({
          name: r.name,
          address: r.address || null,
          email: r.email || null,
          phone: r.phone || null,
          pan: r.pan || null,
          bank_name: r.bank_name || null,
          bank_account: r.bank_account || null,
          ifsc: r.ifsc || null,
          account_holder: r.account_holder || r.name,
          upi_id: r.upi_id || null,
          is_msme: Boolean(r.is_msme),
          msme_registration_no: r.msme_registration_no || null,
        }));
      } else {
        return NextResponse.json(
          { error: "Unsupported file format. Please upload a .csv, .xlsx, or .xls file." },
          { status: 400 }
        );
      }
    } else {
      // JSON payload
      const body = await req.json();
      const rawCreators = Array.isArray(body) ? body : body.creators;

      if (!Array.isArray(rawCreators) || rawCreators.length === 0) {
        return NextResponse.json(
          { error: "Expected non-empty array of creator records in request body." },
          { status: 400 }
        );
      }

      creatorsToSave = rawCreators.map((row, idx) => {
        const norm = normalizeRawRow(row, idx + 1);
        return {
          name: norm.name,
          address: norm.address || null,
          email: norm.email || null,
          phone: norm.phone || null,
          pan: norm.pan || null,
          bank_name: norm.bank_name || null,
          bank_account: norm.bank_account || null,
          ifsc: norm.ifsc || null,
          account_holder: norm.account_holder || norm.name,
          upi_id: norm.upi_id || null,
          is_msme: Boolean(norm.is_msme),
          msme_registration_no: norm.msme_registration_no || null,
        };
      });
    }

    if (creatorsToSave.length === 0) {
      return NextResponse.json(
        {
          error: "No valid creator records found in the uploaded file.",
          summary: fileSummary,
        },
        { status: 400 }
      );
    }

    const result = await bulkUpsertCreators(creatorsToSave);

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${result.total} creators (${result.inserted} added, ${result.updated} updated).`,
      total: result.total,
      inserted: result.inserted,
      updated: result.updated,
      creators: result.creators,
      errors: result.errors,
      summary: fileSummary,
    });
  } catch (error: any) {
    console.error("Creator batch import error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to import creators batch." },
      { status: 500 }
    );
  }
}
