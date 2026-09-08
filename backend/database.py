import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or os.getenv("NEON_DATABASE_URL")
    or os.getenv("SUPABASE_DB_URL")
    or ""
).strip()

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not DATABASE_URL:
    DATABASE_URL = "sqlite:///./surakshapath.db"
    print("[DB] No DATABASE_URL provided. Falling back to local SQLite database.")
elif "?" not in DATABASE_URL and DATABASE_URL.startswith("postgres"):
    DATABASE_URL = f"{DATABASE_URL}?sslmode=require"

engine_kwargs = {"pool_pre_ping": True, "pool_recycle": 300}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
