import { NextRequest, NextResponse } from "next/server";
import { getCreatorById, updateCreator, deleteCreator } from "@/lib/db";
import { PAN_REGEX, IFSC_REGEX, UDYAM_REGEX } from "@/lib/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const creatorId = parseInt(id, 10);
    if (isNaN(creatorId)) {
      return NextResponse.json({ error: "Invalid creator ID" }, { status: 400 });
    }

    const creator = await getCreatorById(creatorId);
    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    return NextResponse.json(creator);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to fetch creator." }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const creatorId = parseInt(id, 10);
    if (isNaN(creatorId)) {
      return NextResponse.json({ error: "Invalid creator ID" }, { status: 400 });
    }

    const body = await req.json();

    if (body.pan && !PAN_REGEX.test(body.pan.trim().toUpperCase())) {
      return NextResponse.json(
        { error: "Invalid PAN format. Must be 5 letters, 4 digits, 1 letter (e.g., ABCDE1234F)." },
        { status: 400 }
      );
    }

    if (body.ifsc && !IFSC_REGEX.test(body.ifsc.trim().toUpperCase())) {
      return NextResponse.json(
        { error: "Invalid IFSC format. Must be 4 letters, '0', and 6 alphanumeric characters (e.g., HDFC0000123)." },
        { status: 400 }
      );
    }

    if (body.msme_registration_no && !UDYAM_REGEX.test(body.msme_registration_no.trim())) {
      return NextResponse.json(
        { error: "Invalid MSME UDYAM format. Must match UDYAM-XX-00-0000000 (e.g., UDYAM-MH-18-0490710)." },
        { status: 400 }
      );
    }

    const updated = await updateCreator(creatorId, body);
    if (!updated) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to update creator." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const creatorId = parseInt(id, 10);
    if (isNaN(creatorId)) {
      return NextResponse.json({ error: "Invalid creator ID" }, { status: 400 });
    }

    const success = await deleteCreator(creatorId);
    if (!success) {
      return NextResponse.json({ error: "Creator not found or already deleted." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Creator deleted successfully." });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to delete creator." }, { status: 500 });
  }
}
