import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrencyINR } from "./utils";
import { InvoiceExcelPayload } from "./excel";
import { getCreatorByNameOrId } from "./db";

export async function generateInvoicePdfBuffer(data: InvoiceExcelPayload): Promise<Buffer> {
  // Fetch authoritative creator details and bank account from database
  let c = { ...data.creator };
  if (c.id || c.name) {
    try {
      const dbCreator = await getCreatorByNameOrId(c.id, c.name);
      if (dbCreator) {
        c = {
          ...c,
          id: dbCreator.id,
          name: c.name || dbCreator.name,
          address: c.address || dbCreator.address || "",
          email: c.email || dbCreator.email || "",
          phone: c.phone || dbCreator.phone || "",
          pan: dbCreator.pan || c.pan || "",
          upi_id: dbCreator.upi_id || c.upi_id || "",
          bank_account: dbCreator.bank_account || c.bank_account || "",
          ifsc: dbCreator.ifsc || c.ifsc || "",
          account_holder: dbCreator.account_holder || c.account_holder || dbCreator.name,
          bank_name: dbCreator.bank_name || c.bank_name || "",
          is_msme: dbCreator.is_msme ?? c.is_msme ?? false,
          msme_registration_no: dbCreator.msme_registration_no || c.msme_registration_no || "",
        };
      }
    } catch (err) {
      console.warn("PDF export: Creator database enrichment error:", err);
    }
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // 1. Header Title & Brand Accent
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, 35, contentWidth, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text("INVOICE", pageWidth / 2, 65, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text("NON-GST INVOICE FOR CREATOR SERVICES", pageWidth / 2, 78, { align: "center" });

  // 2. Creator Details (Left) and Invoice Metadata (Right)
  let y = 105;

  // Left column: Creator Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(c.name || "Creator Name", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const addressLines = doc.splitTextToSize(c.address || "Address not provided", 240);
  doc.text(addressLines, margin, y + 14);

  const addrHeight = addressLines.length * 11;
  const nextLeftY = y + 14 + addrHeight + 4;

  doc.text(`Email ID: ${c.email || "N/A"}`, margin, nextLeftY);
  doc.text(`Contact: ${c.phone || "N/A"}`, margin, nextLeftY + 12);
  doc.setFont("helvetica", "bold");
  doc.text(`PAN: ${c.pan || "N/A"}`, margin, nextLeftY + 24);

  // Right column: Invoice Metadata Box
  const metaX = pageWidth - margin - 220;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(metaX, y - 5, 220, 92, 4, 4, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Invoice No:`, metaX + 12, y + 12);
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text(`${data.invoice_number}`, metaX + 80, y + 12);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.text(`Invoice Date:`, metaX + 12, y + 26);
  doc.text(`${data.invoice_date}`, metaX + 80, y + 26);

  doc.text(`Terms:`, metaX + 12, y + 40);
  doc.text(`${data.payment_terms || "Bank Transfer Or UPI"}`, metaX + 80, y + 40);

  doc.text(`MSME Status:`, metaX + 12, y + 54);
  doc.text(`${c.is_msme ? "YES" : "NO"}`, metaX + 80, y + 54);

  doc.text(`UDYAM No:`, metaX + 12, y + 68);
  doc.text(`${c.msme_registration_no || "N/A"}`, metaX + 80, y + 68);

  // 3. Bill To Box
  y = Math.max(nextLeftY + 42, y + 105);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 68, 4, 4, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("BILL TO:", margin + 12, y + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("B M M RETAIL PRIVATE LIMITED", margin + 12, y + 30);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    "THIRD, 307 A, FAIZ E QUTBI BUILDING, PLOT NO 375, Narsi Natha Street, Masjid Bander Maharashtra, 400009",
    margin + 12,
    y + 43
  );
  doc.text("Contact: +91 88509 80156  |  Email: info@dermalist.in", margin + 12, y + 56);

  // 4. Line Items Table
  y += 82;

  const qty = data.quantity || 1;
  const desc = qty > 1 ? `${qty} x ${data.service_description}` : data.service_description;
  const taxableVal = Number(data.taxable_value) || 0;
  const discountVal = Number(data.discount) || 0;
  const balanceDueVal = Math.max(0, taxableVal - discountVal);

  const tableBody: any[][] = [
    [
      {
        content: `${desc}${data.video_link ? `\nDeliverable / Video Link: ${data.video_link}` : ""}`,
        styles: { fontStyle: "normal" },
      },
      {
        content: formatCurrencyINR(taxableVal),
        styles: { halign: "right", fontStyle: "bold" },
      },
    ],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["DESCRIPTION", "TAXABLE VALUE"]],
    body: tableBody,
    theme: "plain",
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 8,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [51, 65, 85],
      cellPadding: 10,
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: contentWidth - 140 },
      1: { cellWidth: 140, halign: "right" },
    },
  });

  // Calculate table end Y
  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // 5. Totals Breakdown (Right-aligned)
  const totalsWidth = 240;
  const totalsX = pageWidth - margin - totalsWidth;

  const totalsData = [
    ["SUBTOTAL:", formatCurrencyINR(taxableVal)],
    ["DISCOUNT:", formatCurrencyINR(discountVal)],
    ["SUBTOTAL LESS DISCOUNT:", formatCurrencyINR(balanceDueVal)],
    ["BALANCE DUE:", formatCurrencyINR(balanceDueVal)],
  ];

  autoTable(doc, {
    startY: finalY,
    margin: { left: totalsX },
    body: totalsData,
    theme: "plain",
    bodyStyles: {
      fontSize: 9,
      textColor: [71, 85, 105],
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 130, fontStyle: "bold", halign: "right" },
      1: { cellWidth: 110, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (data) => {
      if (data.row.index === 3) {
        data.cell.styles.fillColor = [240, 253, 244]; // brand-50
        data.cell.styles.textColor = [5, 150, 105]; // brand-600
        data.cell.styles.fontSize = 10;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // 6. Banking & Settlement Box (Bottom Left)
  const bankY = finalY;
  const bankWidth = contentWidth - totalsWidth - 20;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, bankY, bankWidth, 90, 4, 4, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("SETTLEMENT & BANKING DETAILS", margin + 10, bankY + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  doc.text(`UPI ID: ${c.upi_id || "Not Provided"}`, margin + 10, bankY + 30);
  doc.text(`Account No: ${c.bank_account || "Not Provided"}`, margin + 10, bankY + 44);
  doc.text(`IFSC Code: ${c.ifsc || "Not Provided"}`, margin + 10, bankY + 58);
  doc.text(
    `Accountholder: ${c.account_holder || c.name || "N/A"}  |  Bank: ${c.bank_name || "N/A"}`,
    margin + 10,
    bankY + 72
  );

  // 7. Footer note
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Thank you for your business! This is a system-generated non-GST invoice.", margin, 790);

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
