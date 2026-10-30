import { Pool } from "pg";

export interface Creator {
  id: number;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  pan: string | null;
  upi_id: string | null;
  bank_account: string | null;
  ifsc: string | null;
  account_holder: string | null;
  bank_name: string | null;
  is_msme: boolean;
  msme_registration_no: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  creator_id: number | null;
  creator_name: string;
  invoice_date: string;
  service_description: string;
  quantity: number;
  unit_price: number;
  taxable_value: number;
  discount: number;
  subtotal_less_discount: number;
  balance_due: number;
  payment_terms: string;
  video_link: string | null;
  status: string;
  excel_path?: string | null;
  pdf_path?: string | null;
  raw_prompt?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Global pool cache for Next.js hot reload
declare global {
  // eslint-disable-next-line no-var
  var _neonPool: Pool | undefined;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL || "";
  // Strip channel_binding if present as pg driver doesn't support that parameter directly
  return url
    .replace("&channel_binding=require", "")
    .replace("channel_binding=require&", "")
    .replace("?channel_binding=require", "");
}

export function getPool(): Pool {
  if (!global._neonPool) {
    const connectionString = getDatabaseUrl();
    global._neonPool = new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=require") || connectionString.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return global._neonPool;
}

let isInitialized = false;

export async function initDatabase(): Promise<void> {
  if (isInitialized) return;
  const pool = getPool();
  try {
    // 1. Ensure creators table exists with all required fields
    await pool.query(`
      CREATE TABLE IF NOT EXISTS creators (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT,
        email TEXT,
        phone TEXT,
        pan TEXT,
        upi_id TEXT,
        bank_account TEXT,
        ifsc TEXT,
        account_holder TEXT,
        bank_name TEXT,
        is_msme BOOLEAN DEFAULT FALSE,
        msme_registration_no TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Ensure missing columns exist in case table was created from an older schema
    await pool.query(`
      ALTER TABLE creators ADD COLUMN IF NOT EXISTS is_msme BOOLEAN DEFAULT FALSE;
      ALTER TABLE creators ADD COLUMN IF NOT EXISTS msme_registration_no TEXT;
    `);

    // 2. Ensure invoices table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number TEXT UNIQUE NOT NULL,
        creator_id INTEGER REFERENCES creators(id) ON DELETE SET NULL,
        creator_name TEXT,
        invoice_date TEXT,
        service_description TEXT,
        quantity INTEGER DEFAULT 1,
        unit_price NUMERIC(10,2) DEFAULT 0,
        taxable_value NUMERIC(10,2) DEFAULT 0,
        discount NUMERIC(10,2) DEFAULT 0,
        subtotal_less_discount NUMERIC(10,2) DEFAULT 0,
        balance_due NUMERIC(10,2) DEFAULT 0,
        payment_terms TEXT DEFAULT 'Bank Transfer Or UPICode',
        video_link TEXT,
        status TEXT DEFAULT 'Generated',
        excel_path TEXT,
        pdf_path TEXT,
        raw_prompt TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await pool.query(`
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'Bank Transfer Or UPICode';
      ALTER TABLE invoices ADD COLUMN IF NOT EXISTS raw_prompt TEXT;
    `);

    isInitialized = true;
  } catch (err) {
    console.error("Database initialization notice:", err);
  }
}

// Helper query function with auto-init
export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  await initDatabase();
  const pool = getPool();
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function getCreators(options?: {
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}): Promise<{ creators: Creator[]; total: number }> {
  await initDatabase();
  const pool = getPool();
  const search = options?.search?.trim() || "";
  const sortOrder = options?.sortOrder === "desc" ? "DESC" : "ASC";
  const sortByCol = ["name", "created_at", "bank_name"].includes(options?.sortBy || "")
    ? options!.sortBy
    : "name";

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  let whereClause = "";
  const params: any[] = [];

  if (search) {
    params.push(`%${search}%`);
    whereClause = `WHERE name ILIKE $1 OR pan ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1 OR bank_name ILIKE $1`;
  }

  const countQuery = `SELECT COUNT(*) as count FROM creators ${whereClause}`;
  const countRes = await pool.query(countQuery, params);
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  const queryParams = [...params, limit, offset];
  const listQuery = `
    SELECT * FROM creators 
    ${whereClause} 
    ORDER BY ${sortByCol} ${sortOrder} 
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
  `;
  const listRes = await pool.query(listQuery, queryParams);

  return { creators: listRes.rows, total };
}

export async function getCreatorById(id: number): Promise<Creator | null> {
  const rows = await query<Creator>("SELECT * FROM creators WHERE id = $1 LIMIT 1", [id]);
  return rows[0] || null;
}

export async function findCreatorByName(name: string): Promise<Creator | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // 1. Try exact case-insensitive match
  const exact = await query<Creator>(
    "SELECT * FROM creators WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1",
    [trimmed]
  );
  if (exact.length > 0) return exact[0];

  // 2. Try partial match (first name or substring)
  const partial = await query<Creator>(
    "SELECT * FROM creators WHERE name ILIKE $1 ORDER BY LENGTH(name) ASC LIMIT 1",
    [`%${trimmed}%`]
  );
  if (partial.length > 0) return partial[0];

  // 3. Try matching first word (e.g. 'Aaditi' matches 'Aaditi Abhijeet Raut')
  const firstWord = trimmed.split(/\s+/)[0];
  if (firstWord.length >= 3) {
    const wordMatch = await query<Creator>(
      "SELECT * FROM creators WHERE name ILIKE $1 ORDER BY LENGTH(name) ASC LIMIT 1",
      [`%${firstWord}%`]
    );
    if (wordMatch.length > 0) return wordMatch[0];
  }

  return null;
}

export async function createCreator(data: Partial<Creator>): Promise<Creator> {
  await initDatabase();
  const rows = await query<Creator>(
    `INSERT INTO creators (
      name, address, email, phone, pan, upi_id, bank_account, ifsc, account_holder, bank_name, is_msme, msme_registration_no
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      data.name,
      data.address || null,
      data.email || null,
      data.phone || null,
      data.pan?.toUpperCase() || null,
      data.upi_id || null,
      data.bank_account || null,
      data.ifsc?.toUpperCase() || null,
      data.account_holder || data.name,
      data.bank_name || null,
      Boolean(data.is_msme),
      data.msme_registration_no || null,
    ]
  );
  return rows[0];
}

export async function updateCreator(id: number, data: Partial<Creator>): Promise<Creator | null> {
  await initDatabase();
  const rows = await query<Creator>(
    `UPDATE creators SET
      name = COALESCE($2, name),
      address = COALESCE($3, address),
      email = COALESCE($4, email),
      phone = COALESCE($5, phone),
      pan = COALESCE($6, pan),
      upi_id = COALESCE($7, upi_id),
      bank_account = COALESCE($8, bank_account),
      ifsc = COALESCE($9, ifsc),
      account_holder = COALESCE($10, account_holder),
      bank_name = COALESCE($11, bank_name),
      is_msme = COALESCE($12, is_msme),
      msme_registration_no = COALESCE($13, msme_registration_no),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [
      id,
      data.name,
      data.address,
      data.email,
      data.phone,
      data.pan?.toUpperCase(),
      data.upi_id,
      data.bank_account,
      data.ifsc?.toUpperCase(),
      data.account_holder,
      data.bank_name,
      data.is_msme,
      data.msme_registration_no,
    ]
  );
  return rows[0] || null;
}

export async function deleteCreator(id: number): Promise<boolean> {
  await initDatabase();
  const pool = getPool();
  const res = await pool.query("DELETE FROM creators WHERE id = $1", [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function getInvoices(options?: {
  search?: string;
  creatorId?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<{ invoices: Invoice[]; total: number }> {
  await initDatabase();
  const pool = getPool();
  const search = options?.search?.trim() || "";
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(invoice_number ILIKE $${params.length} OR creator_name ILIKE $${params.length} OR service_description ILIKE $${params.length})`);
  }

  if (options?.creatorId) {
    params.push(options.creatorId);
    conditions.push(`creator_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRes = await pool.query(`SELECT COUNT(*) as count FROM invoices ${whereClause}`, params);
  const total = parseInt(countRes.rows[0]?.count || "0", 10);

  const queryParams = [...params, limit, offset];
  const listRes = await pool.query(
    `SELECT * FROM invoices 
     ${whereClause} 
     ORDER BY id DESC 
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams
  );

  return { invoices: listRes.rows, total };
}

export async function getNextInvoiceNumber(): Promise<string> {
  await initDatabase();
  const prefix = process.env.INVOICE_PREFIX || "DL-";
  const rows = await query<{ invoice_number: string }>(
    `SELECT invoice_number FROM invoices ORDER BY id DESC LIMIT 50`
  );

  let maxNum = 0;
  for (const r of rows) {
    const raw = r.invoice_number;
    // Extract any ending digits e.g. DL-001 -> 1, DL-2026-005 -> 5
    const match = raw.match(/\d+$/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(3, "0");
  return `${prefix}${padded}`;
}

export async function createInvoice(data: {
  invoice_number: string;
  creator_id?: number | null;
  creator_name: string;
  invoice_date: string;
  service_description: string;
  quantity?: number;
  unit_price?: number;
  taxable_value: number;
  discount?: number;
  subtotal_less_discount: number;
  balance_due: number;
  payment_terms?: string;
  video_link?: string | null;
  status?: string;
  excel_path?: string | null;
  pdf_path?: string | null;
  raw_prompt?: string | null;
}): Promise<Invoice> {
  await initDatabase();
  const rows = await query<Invoice>(
    `INSERT INTO invoices (
      invoice_number, creator_id, creator_name, invoice_date, service_description,
      quantity, unit_price, taxable_value, discount, subtotal_less_discount,
      balance_due, payment_terms, video_link, status, excel_path, pdf_path, raw_prompt
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *`,
    [
      data.invoice_number,
      data.creator_id || null,
      data.creator_name,
      data.invoice_date,
      data.service_description,
      data.quantity || 1,
      data.unit_price || data.taxable_value,
      data.taxable_value,
      data.discount || 0,
      data.subtotal_less_discount,
      data.balance_due,
      data.payment_terms || "Bank Transfer Or UPICode",
      data.video_link || null,
      data.status || "Generated",
      data.excel_path || null,
      data.pdf_path || null,
      data.raw_prompt || null,
    ]
  );
  return rows[0];
}

export async function deleteInvoice(id: number): Promise<boolean> {
  await initDatabase();
  const pool = getPool();
  const res = await pool.query("DELETE FROM invoices WHERE id = $1", [id]);
  return (res.rowCount ?? 0) > 0;
}
