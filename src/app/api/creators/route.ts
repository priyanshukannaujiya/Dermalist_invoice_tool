import { NextRequest, NextResponse } from "next/server";
import { getCreators, createCreator } from "@/lib/db";
import { PAN_REGEX, IFSC_REGEX, UDYAM_REGEX } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const sortBy = searchParams.get("sortBy") || "name";
    const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "asc";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const data = await getCreators({ search, sortBy, sortOrder, limit, offset });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("GET /api/creators error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch creators." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body?.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Creator name is required." }, { status: 400 });
    }

    // Validate PAN if provided
    if (body.pan && !PAN_REGEX.test(body.pan.trim().toUpperCase())) {
      return NextResponse.json(
        { error: "Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g., ABCDE1234F)." },
        { status: 400 }
      );
    }

    // Validate IFSC if provided
    if (body.ifsc && !IFSC_REGEX.test(body.ifsc.trim().toUpperCase())) {
      return NextResponse.json(
        { error: "Invalid IFSC format. Must be 4 letters, '0', and 6 alphanumeric characters (e.g., HDFC0000123)." },
        { status: 400 }
      );
    }

    // Validate UDYAM if provided
    if (body.msme_registration_no && !UDYAM_REGEX.test(body.msme_registration_no.trim())) {
      return NextResponse.json(
        { error: "Invalid MSME UDYAM format. Must match UDYAM-XX-00-0000000 (e.g., UDYAM-MH-18-0490710)." },
        { status: 400 }
      );
    }

    const creator = await createCreator(body);
    return NextResponse.json(creator, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/creators error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to create creator profile." },
      { status: 500 }
    );
  }
}
