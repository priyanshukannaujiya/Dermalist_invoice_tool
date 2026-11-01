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
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not configured. Please add DATABASE_URL to your environment variables (e.g. in Vercel Project Settings)."
      );
    }
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
let initPromise: Promise<void> | null = null;

export async function initDatabase(): Promise<void> {
  if (isInitialized) return;
  if (!getDatabaseUrl()) return;

  if (!initPromise) {
    initPromise = (async () => {
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
          ALTER TABLE creators ALTER COLUMN created_at SET DEFAULT NOW();
          ALTER TABLE creators ALTER COLUMN updated_at SET DEFAULT NOW();
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

        // 3. Performance Indexes for instant B-tree lookups
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_creators_name_lower ON creators (LOWER(TRIM(name)));
          CREATE INDEX IF NOT EXISTS idx_creators_pan ON creators (UPPER(TRIM(pan)));
          CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices (invoice_number);
          CREATE INDEX IF NOT EXISTS idx_invoices_id_desc ON invoices (id DESC);
        `);

        isInitialized = true;
      } catch (err) {
        console.error("Database initialization notice:", err);
      }
    })();
  }
  await initPromise;
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
  const queryParams = [...params, limit, offset];
  const listQuery = `
    SELECT * FROM creators 
    ${whereClause} 
    ORDER BY ${sortByCol} ${sortOrder} 
    LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
  `;

  // Parallelize count and list queries to cut latency in half
  const [countRes, listRes] = await Promise.all([
    pool.query(countQuery, params),
    pool.query(listQuery, queryParams),
  ]);

  const total = parseInt(countRes.rows[0]?.count || "0", 10);
  return { creators: listRes.rows, total };
}

export async function getCreatorById(id: number): Promise<Creator | null> {
  const rows = await query<Creator>("SELECT * FROM creators WHERE id = $1 LIMIT 1", [id]);
  return rows[0] || null;
}

export async function findCreatorByName(name: string): Promise<Creator | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  // 1. Single roundtrip fast match: Exact Name OR PAN
  const fastMatches = await query<Creator>(
    `SELECT * FROM creators 
     WHERE LOWER(TRIM(name)) = LOWER($1) 
        OR (pan IS NOT NULL AND UPPER(TRIM(pan)) = UPPER($1))
     ORDER BY 
       CASE 
         WHEN LOWER(TRIM(name)) = LOWER($1) THEN 1 
         ELSE 2 
       END ASC
     LIMIT 1`,
    [trimmed]
  );
  if (fastMatches.length > 0) return fastMatches[0];

  // 3. Extract meaningful words (filtering out common prefixes/honorifics)
  // Strip out special regex characters to safely pass into Postgres regex
  const sanitized = trimmed.replace(/[^\w\s]/g, " ").trim();
  const words = sanitized
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(
      (w) =>
        w.length >= 2 &&
        !["mr", "mrs", "ms", "miss", "dr", "the", "creator", "influencer", "profile"].includes(
          w.toLowerCase()
        )
    );

  if (words.length === 0) return null;

  // 4. If query has multiple words (e.g. "Sneha Patil" or "Neha Patil"):
  // Require ALL words to match as discrete words with PostgreSQL word boundary regex \y
  // This guarantees that "Neha Patil" will NEVER match "Sneha Patil" or "Priya Patil"
  if (words.length > 1) {
    const conditions = words.map((_, i) => `name ~* $${i + 1}`).join(" AND ");
    const regexParams = words.map((w) => `\\y${w}\\y`);
    const multiMatch = await query<Creator>(
      `SELECT * FROM creators WHERE ${conditions} ORDER BY LENGTH(name) ASC LIMIT 1`,
      regexParams
    );
    if (multiMatch.length > 0) return multiMatch[0];
  }

  // 5. If query is a single word (e.g. "Sneha"):
  // Require word boundary regex \y so "Neha" does NOT match "Sneha"
  if (words.length === 1 && words[0].length >= 3) {
    const singleWord = words[0];
    const singleMatch = await query<Creator>(
      "SELECT * FROM creators WHERE name ~* $1 ORDER BY LENGTH(name) ASC LIMIT 1",
      [`\\y${singleWord}\\y`]
    );
    if (singleMatch.length > 0) return singleMatch[0];
  }

  return null;
}

export async function getCreatorByNameOrId(
  id?: number | null,
  name?: string | null
): Promise<Creator | null> {
  if (id && !isNaN(Number(id))) {
    const byId = await getCreatorById(Number(id));
    if (byId) return byId;
  }
  if (name && name.trim()) {
    const byName = await findCreatorByName(name);
    if (byName) return byName;
  }
  return null;
}

export async function upsertCreator(data: Partial<Creator>): Promise<{ creator: Creator; isNew: boolean }> {
  await initDatabase();
  const name = (data.name || "").trim();
  if (!name) throw new Error("Creator name is required.");

  const pan = data.pan ? data.pan.trim().toUpperCase() : null;

  // Check if creator exists by PAN or by exact name
  let existing: Creator | null = null;
  if (pan) {
    const panRows = await query<Creator>(
      "SELECT * FROM creators WHERE UPPER(TRIM(pan)) = $1 LIMIT 1",
      [pan]
    );
    if (panRows.length > 0) existing = panRows[0];
  }

  if (!existing) {
    const nameRows = await query<Creator>(
      "SELECT * FROM creators WHERE LOWER(TRIM(name)) = LOWER($1) LIMIT 1",
      [name]
    );
    if (nameRows.length > 0) existing = nameRows[0];
  }

  if (existing) {
    const updated = await updateCreator(existing.id, {
      name: data.name || existing.name,
      address: data.address !== undefined ? data.address : existing.address,
      email: data.email !== undefined ? data.email : existing.email,
      phone: data.phone !== undefined ? data.phone : existing.phone,
      pan: pan || existing.pan,
      upi_id: data.upi_id !== undefined ? data.upi_id : existing.upi_id,
      bank_account: data.bank_account !== undefined && data.bank_account !== "" ? data.bank_account : existing.bank_account,
      ifsc: data.ifsc ? data.ifsc.trim().toUpperCase() : existing.ifsc,
      account_holder: data.account_holder || existing.account_holder || data.name || existing.name,
      bank_name: data.bank_name !== undefined && data.bank_name !== "" ? data.bank_name : existing.bank_name,
      is_msme: data.is_msme !== undefined ? Boolean(data.is_msme) : existing.is_msme,
      msme_registration_no: data.msme_registration_no !== undefined ? data.msme_registration_no : existing.msme_registration_no,
    });
    return { creator: updated!, isNew: false };
  } else {
    const created = await createCreator(data);
    return { creator: created, isNew: true };
  }
}

export async function bulkUpsertCreators(creatorsList: Partial<Creator>[]): Promise<{
  total: number;
  inserted: number;
  updated: number;
  creators: Creator[];
  errors: string[];
}> {
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];
  const results: Creator[] = [];

  for (let i = 0; i < creatorsList.length; i++) {
    const c = creatorsList[i];
    try {
      if (!c.name?.trim()) {
        errors.push(`Row ${i + 1}: Name is required`);
        continue;
      }
      const { creator, isNew } = await upsertCreator(c);
      if (isNew) inserted++;
      else updated++;
      results.push(creator);
    } catch (err: any) {
      errors.push(`Row ${i + 1} (${c.name || "Unknown"}): ${err.message || "Failed to save"}`);
    }
  }

  return {
    total: results.length,
    inserted,
    updated,
    creators: results,
    errors,
  };
}

export async function createCreator(data: Partial<Creator>): Promise<Creator> {
  await initDatabase();
  const rows = await query<Creator>(
    `INSERT INTO creators (
      name, address, email, phone, pan, upi_id, bank_account, ifsc, account_holder, bank_name, is_msme, msme_registration_no, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
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

  const countQuery = `SELECT COUNT(*) as count FROM invoices ${whereClause}`;
  const queryParams = [...params, limit, offset];
  const listQuery = `
    SELECT * FROM invoices 
     ${whereClause} 
     ORDER BY id DESC 
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
  `;

  // Parallelize count and list queries
  const [countRes, listRes] = await Promise.all([
    pool.query(countQuery, params),
    pool.query(listQuery, queryParams),
  ]);

  const total = parseInt(countRes.rows[0]?.count || "0", 10);
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
