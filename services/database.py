"""
Database service for AI Invoice Studio.
Supports Neon PostgreSQL with automatic graceful fallback to SQLite.
Provides dict-like row access, automatic table initialization,
and seamless data persistence.
"""

import os
import sqlite3
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DEFAULT_DB_PATH = os.getenv("DB_PATH", "data/invoice_studio.db")


def is_postgres_configured() -> bool:
    """Check if PostgreSQL database URL is set."""
    return bool(DATABASE_URL and (DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")))


_PG_POOL = None
_CACHED_DB_TYPE = None


def get_pg_pool():
    """Get or initialize ThreadedConnectionPool for fast connection reuse."""
    global _PG_POOL
    if _PG_POOL is None and is_postgres_configured():
        try:
            import psycopg2.pool
            from psycopg2.extras import RealDictCursor

            clean_url = os.getenv("DATABASE_URL", "").strip()
            if "channel_binding=" in clean_url:
                clean_url = clean_url.replace("&channel_binding=require", "").replace("channel_binding=require&", "").replace("?channel_binding=require", "")
                if clean_url.endswith("?"):
                    clean_url = clean_url[:-1]

            _PG_POOL = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=10,
                dsn=clean_url,
                connect_timeout=8,
                cursor_factory=RealDictCursor,
            )
        except Exception:
            _PG_POOL = None
    return _PG_POOL


def get_pg_connection():
    """Get a PostgreSQL connection from the pool for instant reuse (or create new if pool exhausted)."""
    pool = get_pg_pool()
    if pool:
        try:
            conn = pool.getconn()
            if conn.closed:
                pool.putconn(conn, close=True)
                conn = pool.getconn()
            return conn, pool
        except Exception:
            pass

    import psycopg2
    from psycopg2.extras import RealDictCursor

    clean_url = os.getenv("DATABASE_URL", "").strip()
    if "channel_binding=" in clean_url:
        clean_url = clean_url.replace("&channel_binding=require", "").replace("channel_binding=require&", "").replace("?channel_binding=require", "")
        if clean_url.endswith("?"):
            clean_url = clean_url[:-1]

    conn = psycopg2.connect(clean_url, connect_timeout=8, cursor_factory=RealDictCursor)
    return conn, None


def get_sqlite_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Get a SQLite database connection with Row factory."""
    path = db_path or DEFAULT_DB_PATH
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def get_db_type() -> str:
    """Return active database engine name with caching."""
    global _CACHED_DB_TYPE
    if _CACHED_DB_TYPE:
        return _CACHED_DB_TYPE

    if is_postgres_configured():
        try:
            conn, pool = get_pg_connection()
            if pool:
                pool.putconn(conn)
            else:
                conn.close()
            _CACHED_DB_TYPE = "Neon PostgreSQL"
            return _CACHED_DB_TYPE
        except Exception:
            _CACHED_DB_TYPE = "SQLite (Fallback)"
            return _CACHED_DB_TYPE
    _CACHED_DB_TYPE = "SQLite (Local)"
    return _CACHED_DB_TYPE


def _sanitize_row(row_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Convert Decimal or non-serializable types to native Python floats/ints."""
    if not row_dict:
        return row_dict
    from decimal import Decimal
    clean = {}
    for k, v in row_dict.items():
        if isinstance(v, Decimal):
            clean[k] = float(v)
        else:
            clean[k] = v
    return clean


_DB_INITIALIZED = False


def execute_query(query: str, params: tuple = (), fetch_one: bool = False, fetch_all: bool = False, is_insert: bool = False, db_path: Optional[str] = None) -> Any:
    """
    Execute SQL query across either Neon PostgreSQL (using fast connection pool) or SQLite.
    Automatically translates parameter placeholders (? vs %s) and handles return values.
    Includes 1 retry attempt for PostgreSQL transient cold-start drops.
    """
    use_pg = is_postgres_configured() and db_path is None

    if use_pg:
        for attempt in range(2):
            conn = None
            pool = None
            try:
                conn, pool = get_pg_connection()
                try:
                    with conn.cursor() as cur:
                        pg_query = query.replace("?", "%s")
                        if is_insert and "RETURNING" not in pg_query.upper():
                            pg_query += " RETURNING id"
                        cur.execute(pg_query, params)
                        conn.commit()
                        if fetch_one:
                            res = cur.fetchone()
                            return _sanitize_row(dict(res)) if res else None
                        if fetch_all:
                            res = cur.fetchall()
                            return [_sanitize_row(dict(r)) for r in res]
                        if is_insert:
                            ret = cur.fetchone()
                            return ret["id"] if ret else None
                        return cur.rowcount
                finally:
                    if pool and conn:
                        pool.putconn(conn)
                    elif conn:
                        conn.close()
            except Exception as e:
                if pool and conn:
                    try:
                        pool.putconn(conn, close=True)
                    except Exception:
                        pass
                    conn = None
                if attempt == 0:
                    import time
                    time.sleep(0.3)
                    continue
                # If retry also fails, fall back to SQLite
                break

    # SQLite execution
    conn = get_sqlite_connection(db_path)
    try:
        cur = conn.cursor()
        sqlite_query = query.replace("%s", "?")
        cur.execute(sqlite_query, params)
        conn.commit()
        if fetch_one:
            res = cur.fetchone()
            return _sanitize_row(dict(res)) if res else None
        if fetch_all:
            res = cur.fetchall()
            return [_sanitize_row(dict(r)) for r in res]
        if is_insert:
            return cur.lastrowid
        return cur.rowcount
    finally:
        conn.close()


def init_db(db_path: Optional[str] = None, force: bool = False) -> None:
    """Initialize database tables for PostgreSQL and SQLite fallback to guarantee zero glitches."""
    global _DB_INITIALIZED
    if _DB_INITIALIZED and not force and db_path is None:
        return

    use_pg = is_postgres_configured() and db_path is None

    if use_pg:
        conn = None
        pool = None
        try:
            conn, pool = get_pg_connection()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
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
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );
                        """
                    )
                    cur.execute(
                        """
                        CREATE TABLE IF NOT EXISTS invoices (
                            id SERIAL PRIMARY KEY,
                            invoice_number TEXT UNIQUE NOT NULL,
                            creator_id INTEGER NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,
                            creator_name TEXT NOT NULL,
                            invoice_date TEXT NOT NULL,
                            service_description TEXT NOT NULL,
                            quantity INTEGER DEFAULT 1,
                            unit_price NUMERIC NOT NULL,
                            taxable_value NUMERIC NOT NULL,
                            discount NUMERIC DEFAULT 0.0,
                            subtotal_less_discount NUMERIC NOT NULL,
                            balance_due NUMERIC NOT NULL,
                            video_link TEXT,
                            status TEXT DEFAULT 'Generated',
                            excel_path TEXT,
                            pdf_path TEXT,
                            created_at TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );
                        """
                    )
                    conn.commit()
            finally:
                if pool and conn:
                    pool.putconn(conn)
                elif conn:
                    conn.close()
            seed_initial_data(use_pg=True)
        except Exception:
            pass

    # Ensure SQLite fallback schema is ALWAYS initialized as well
    conn = get_sqlite_connection(db_path)
    with conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS creators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_number TEXT UNIQUE NOT NULL,
                creator_id INTEGER NOT NULL,
                creator_name TEXT NOT NULL,
                invoice_date TEXT NOT NULL,
                service_description TEXT NOT NULL,
                quantity INTEGER DEFAULT 1,
                unit_price REAL NOT NULL,
                taxable_value REAL NOT NULL,
                discount REAL DEFAULT 0.0,
                subtotal_less_discount REAL NOT NULL,
                balance_due REAL NOT NULL,
                video_link TEXT,
                status TEXT DEFAULT 'Generated',
                excel_path TEXT,
                pdf_path TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE RESTRICT
            )
            """
        )
        conn.commit()

    seed_initial_data(db_path=db_path)
    if db_path is None:
        _DB_INITIALIZED = True


def seed_initial_data(db_path: Optional[str] = None, use_pg: bool = False) -> None:
    """Seed initial realistic test creators if table is empty."""
    res = execute_query("SELECT COUNT(*) as count FROM creators", fetch_one=True, db_path=db_path)
    if res and res.get("count", 0) == 0:
        now = datetime.now().isoformat()
        sample_creators = [
            (
                "Aaditi Abhijeet Raut",
                "Flat 402, Sunshine Heights, Andheri West, Mumbai, Maharashtra 400053",
                "aaditi.raut@example.com",
                "+91 98201 23456",
                "ABCDE1234F",
                "aaditi@okhdfcbank",
                "50100234567890",
                "HDFC0000123",
                "Aaditi Abhijeet Raut",
                "HDFC Bank",
                now,
                now,
            ),
            (
                "Rohan Sharma",
                "301, Palm Court, Sector 14, Gurgaon, Haryana 122001",
                "rohan.sharma@example.com",
                "+91 98112 34567",
                "BPZPS9876K",
                "rohansharma@icici",
                "002301567890",
                "ICIC0000023",
                "Rohan Sharma",
                "ICICI Bank",
                now,
                now,
            ),
            (
                "Priya Venkat",
                "12, Indiranagar 100ft Road, Bangalore, Karnataka 560038",
                "priya.venkat@example.com",
                "+91 99001 87654",
                "ABCDE5678G",
                "priyavenkat@axisbank",
                "912010045678901",
                "UTIB0000054",
                "Priya Venkat",
                "Axis Bank",
                now,
                now,
            ),
        ]

        for c in sample_creators:
            execute_query(
                """
                INSERT INTO creators (
                    name, address, email, phone, pan, upi_id,
                    bank_account, ifsc, account_holder, bank_name,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                c,
                is_insert=True,
                db_path=db_path,
            )


# ==================== CREATOR OPERATIONS ====================


def get_creators(search_query: Optional[str] = None, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve creator profiles, optionally filtered by search query."""
    if search_query:
        q = f"%{search_query.strip()}%"
        return execute_query(
            """
            SELECT * FROM creators 
            WHERE name ILIKE ? OR email ILIKE ? OR phone ILIKE ? OR pan ILIKE ?
            ORDER BY name ASC
            """ if is_postgres_configured() and db_path is None else
            """
            SELECT * FROM creators 
            WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? OR pan LIKE ?
            ORDER BY name ASC
            """,
            (q, q, q, q),
            fetch_all=True,
            db_path=db_path,
        ) or []
    return execute_query("SELECT * FROM creators ORDER BY name ASC", fetch_all=True, db_path=db_path) or []


def get_creator_by_id(creator_id: int, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get single creator by ID."""
    return execute_query("SELECT * FROM creators WHERE id = ?", (creator_id,), fetch_one=True, db_path=db_path)


def find_creator_by_name(name: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Find creator with case-insensitive exact or substring match."""
    cleaned = name.strip()
    if not cleaned:
        return None

    # Exact case-insensitive match first
    row = execute_query(
        "SELECT * FROM creators WHERE LOWER(name) = LOWER(?) LIMIT 1",
        (cleaned,),
        fetch_one=True,
        db_path=db_path,
    )
    if row:
        return row

    # Substring match
    row = execute_query(
        "SELECT * FROM creators WHERE LOWER(name) LIKE LOWER(?) LIMIT 1",
        (f"%{cleaned}%",),
        fetch_one=True,
        db_path=db_path,
    )
    if row:
        return row

    # Check by individual tokens
    tokens = cleaned.split()
    for token in tokens:
        if len(token) > 2:
            row = execute_query(
                "SELECT * FROM creators WHERE LOWER(name) LIKE LOWER(?) LIMIT 1",
                (f"%{token}%",),
                fetch_one=True,
                db_path=db_path,
            )
            if row:
                return row

    return None


def create_creator(data: Dict[str, Any], db_path: Optional[str] = None) -> int:
    """Insert a new creator profile and return new ID."""
    now = datetime.now().isoformat()
    return execute_query(
        """
        INSERT INTO creators (
            name, address, email, phone, pan, upi_id,
            bank_account, ifsc, account_holder, bank_name,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.get("name", "").strip(),
            data.get("address", "").strip(),
            data.get("email", "").strip(),
            data.get("phone", "").strip(),
            data.get("pan", "").strip().upper(),
            data.get("upi_id", "").strip(),
            data.get("bank_account", "").strip(),
            data.get("ifsc", "").strip().upper(),
            data.get("account_holder", "").strip(),
            data.get("bank_name", "").strip(),
            now,
            now,
        ),
        is_insert=True,
        db_path=db_path,
    )


def update_creator(creator_id: int, data: Dict[str, Any], db_path: Optional[str] = None) -> bool:
    """Update existing creator profile."""
    now = datetime.now().isoformat()
    count = execute_query(
        """
        UPDATE creators SET
            name = ?, address = ?, email = ?, phone = ?, pan = ?,
            upi_id = ?, bank_account = ?, ifsc = ?, account_holder = ?,
            bank_name = ?, updated_at = ?
        WHERE id = ?
        """,
        (
            data.get("name", "").strip(),
            data.get("address", "").strip(),
            data.get("email", "").strip(),
            data.get("phone", "").strip(),
            data.get("pan", "").strip().upper(),
            data.get("upi_id", "").strip(),
            data.get("bank_account", "").strip(),
            data.get("ifsc", "").strip().upper(),
            data.get("account_holder", "").strip(),
            data.get("bank_name", "").strip(),
            now,
            creator_id,
        ),
        db_path=db_path,
    )
    return count > 0


def delete_creator(creator_id: int, db_path: Optional[str] = None) -> bool:
    """Delete creator if no associated invoices exist."""
    res = execute_query("SELECT COUNT(*) as count FROM invoices WHERE creator_id = ?", (creator_id,), fetch_one=True, db_path=db_path)
    if res and res.get("count", 0) > 0:
        raise ValueError("Cannot delete creator with associated invoices. Archive instead.")

    count = execute_query("DELETE FROM creators WHERE id = ?", (creator_id,), db_path=db_path)
    return count > 0


# ==================== INVOICE OPERATIONS ====================


def get_next_invoice_number(prefix: Optional[str] = None, db_path: Optional[str] = None) -> str:
    """
    Generate sequential invoice number: DL-001, DL-002, etc.
    Guarantees no collisions across database restarts.
    """
    pfx = prefix or os.getenv("INVOICE_PREFIX", "DL-")
    row = execute_query(
        """
        SELECT invoice_number FROM invoices 
        WHERE invoice_number LIKE ? 
        ORDER BY id DESC LIMIT 1
        """,
        (f"{pfx}%",),
        fetch_one=True,
        db_path=db_path,
    )

    if not row:
        start_num = int(os.getenv("INVOICE_START_NUMBER", "1"))
        return f"{pfx}{start_num:03d}"

    last_no = row["invoice_number"]
    suffix = last_no[len(pfx) :]
    digits = ""
    for ch in suffix:
        if ch.isdigit():
            digits += ch
        else:
            digits = ""

    try:
        next_int = int(digits) + 1 if digits else 1
    except ValueError:
        next_int = 1

    candidate = f"{pfx}{next_int:03d}"
    while check_invoice_number_exists(candidate, db_path):
        next_int += 1
        candidate = f"{pfx}{next_int:03d}"

    return candidate


def check_invoice_number_exists(invoice_number: str, db_path: Optional[str] = None) -> bool:
    """Check if invoice number is already taken."""
    res = execute_query("SELECT 1 as exists_flag FROM invoices WHERE invoice_number = ? LIMIT 1", (invoice_number.strip(),), fetch_one=True, db_path=db_path)
    return res is not None


def create_invoice(data: Dict[str, Any], db_path: Optional[str] = None) -> int:
    """Save an invoice record to PostgreSQL or SQLite."""
    inv_no = data.get("invoice_number", "").strip()
    if check_invoice_number_exists(inv_no, db_path):
        raise ValueError(f"Invoice number '{inv_no}' already exists. Invoice numbers must be unique.")

    now = datetime.now().isoformat()
    return execute_query(
        """
        INSERT INTO invoices (
            invoice_number, creator_id, creator_name, invoice_date,
            service_description, quantity, unit_price, taxable_value,
            discount, subtotal_less_discount, balance_due, video_link,
            status, excel_path, pdf_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            inv_no,
            data["creator_id"],
            data["creator_name"],
            data["invoice_date"],
            data["service_description"],
            int(data.get("quantity", 1)),
            float(data.get("unit_price", 0.0)),
            float(data.get("taxable_value", 0.0)),
            float(data.get("discount", 0.0)),
            float(data.get("subtotal_less_discount", 0.0)),
            float(data.get("balance_due", 0.0)),
            data.get("video_link", ""),
            data.get("status", "Generated"),
            data.get("excel_path", ""),
            data.get("pdf_path", ""),
            now,
            now,
        ),
        is_insert=True,
        db_path=db_path,
    )


def update_invoice_status(invoice_id: int, status: str, db_path: Optional[str] = None) -> bool:
    """Update status of an invoice (Draft, Generated, Paid)."""
    valid_statuses = ["Draft", "Generated", "Paid"]
    if status not in valid_statuses:
        raise ValueError(f"Invalid status '{status}'. Must be one of: {valid_statuses}")

    now = datetime.now().isoformat()
    count = execute_query(
        "UPDATE invoices SET status = ?, updated_at = ? WHERE id = ?",
        (status, now, invoice_id),
        db_path=db_path,
    )
    return count > 0


def get_invoices(
    search_query: Optional[str] = None,
    creator_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: Optional[int] = None,
    db_path: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Retrieve invoices with optional filters and limit."""
    query = "SELECT * FROM invoices WHERE 1=1"
    params: List[Any] = []

    if search_query:
        query += " AND (invoice_number LIKE ? OR creator_name LIKE ? OR service_description LIKE ?)"
        q = f"%{search_query.strip()}%"
        params.extend([q, q, q])

    if creator_id:
        query += " AND creator_id = ?"
        params.append(creator_id)

    if status and status != "All":
        query += " AND status = ?"
        params.append(status)

    query += " ORDER BY id DESC"

    if limit and limit > 0:
        query += f" LIMIT {int(limit)}"

    rows = execute_query(query, tuple(params), fetch_all=True, db_path=db_path) or []
    # Ensure float conversion for numeric fields from postgres
    for r in rows:
        for k in ["unit_price", "taxable_value", "discount", "subtotal_less_discount", "balance_due"]:
            if k in r and r[k] is not None:
                r[k] = float(r[k])
    return rows


def get_invoice_by_id(invoice_id: int, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get single invoice by ID."""
    row = execute_query("SELECT * FROM invoices WHERE id = ?", (invoice_id,), fetch_one=True, db_path=db_path)
    if row:
        for k in ["unit_price", "taxable_value", "discount", "subtotal_less_discount", "balance_due"]:
            if k in row and row[k] is not None:
                row[k] = float(row[k])
    return row


def get_invoice_by_number(invoice_number: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get invoice by invoice number."""
    row = execute_query("SELECT * FROM invoices WHERE invoice_number = ?", (invoice_number.strip(),), fetch_one=True, db_path=db_path)
    if row:
        for k in ["unit_price", "taxable_value", "discount", "subtotal_less_discount", "balance_due"]:
            if k in row and row[k] is not None:
                row[k] = float(row[k])
    return row


# ==================== DASHBOARD METRICS ====================


def get_dashboard_metrics(db_path: Optional[str] = None) -> Dict[str, Any]:
    """Calculate aggregate summary stats for the dashboard cards in a single ultra-fast query."""
    current_year_month = datetime.now().strftime("%Y-%m")
    current_month_alt = datetime.now().strftime("%m-%Y")

    query = """
    SELECT 
        (SELECT COUNT(*) FROM invoices) AS total_invoices,
        (SELECT COUNT(*) FROM invoices WHERE invoice_date LIKE ? OR invoice_date LIKE ? OR created_at LIKE ?) AS monthly_invoices,
        (SELECT COALESCE(SUM(balance_due), 0.0) FROM invoices) AS total_billed,
        (SELECT COALESCE(SUM(balance_due), 0.0) FROM invoices WHERE status != 'Paid') AS pending_total,
        (SELECT COUNT(*) FROM invoices WHERE status != 'Paid') AS pending_count,
        (SELECT COUNT(*) FROM creators) AS total_creators
    """
    row = execute_query(
        query,
        (f"%{current_year_month}%", f"%{current_month_alt}%", f"{current_year_month}%"),
        fetch_one=True,
        db_path=db_path,
    )
    if row:
        return {
            "total_invoices": int(row.get("total_invoices") or 0),
            "monthly_invoices": int(row.get("monthly_invoices") or 0),
            "total_billed": float(row.get("total_billed") or 0.0),
            "pending_total": float(row.get("pending_total") or 0.0),
            "pending_count": int(row.get("pending_count") or 0),
            "total_creators": int(row.get("total_creators") or 0),
        }

    return {
        "total_invoices": 0,
        "monthly_invoices": 0,
        "total_billed": 0.0,
        "pending_total": 0.0,
        "pending_count": 0,
        "total_creators": 0,
    }
