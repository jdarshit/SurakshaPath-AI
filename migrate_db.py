#!/usr/bin/env python
"""Database migration script to add severity column to existing incidents table"""

from backend.database import engine
from sqlalchemy import text, inspect

# Check if column exists
inspector = inspect(engine)
columns = [col['name'] for col in inspector.get_columns('incidents')]

if 'severity' not in columns:
    print("⏳ Adding severity column to incidents table...")
    with engine.connect() as connection:
        connection.execute(text("ALTER TABLE incidents ADD COLUMN severity VARCHAR(20) DEFAULT 'medium'"))
        connection.commit()
    print("✅ Severity column added successfully!")
else:
    print("✅ Severity column already exists!")

# Verify
inspector = inspect(engine)
columns = [col['name'] for col in inspector.get_columns('incidents')]
print(f"   Columns: {', '.join(columns)}")
