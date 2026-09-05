from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text, inspect, text
from sqlalchemy.orm import relationship

try:
    from backend.database import Base
except Exception:
    from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    email = Column(String(100), unique=True)
    phone = Column(String(15))
    password_hash = Column(String(256), nullable=True)
    is_active = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    otp_code = Column(String(10), nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)
    trusted_contact_name = Column(String(100))
    trusted_contact_phone = Column(String(15))
    guardian_name = Column(String(100), nullable=True)
    guardian_phone = Column(String(15), nullable=True)
    guardian_relation = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    incidents = relationship("Incident", back_populates="user")


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    lat = Column(Float)
    lng = Column(Float)
    area_name = Column(String(100))
    incident_type = Column(String(50))
    description = Column(Text)
    severity = Column(String(20), default="medium")  # high, medium, low
    verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="incidents")


class SOSAlert(Base):
    __tablename__ = "sos_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    lat = Column(Float)
    lng = Column(Float)
    source = Column(String(20))
    message = Column(Text, nullable=True)
    status = Column(String(20), default="active")
    triggered_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


class Area(Base):
    __tablename__ = "areas"

    id = Column(Integer, primary_key=True, autoincrement=True)
    area_name = Column(String(100))
    ward_no = Column(Integer)
    lat = Column(Float)
    lng = Column(Float)
    area_type = Column(String(50))
    lighting_quality = Column(String(20))
    crime_rate = Column(String(20))
    cctv_coverage = Column(Boolean)
    police_distance_km = Column(Float)
    incident_count = Column(Integer, default=0)
    safety_score_day = Column(Float)
    safety_score_night = Column(Float)


def init_db(engine):
    Base.metadata.create_all(bind=engine)


def ensure_auth_columns(engine):
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    statements = []

    if "password_hash" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN password_hash VARCHAR(256) NULL")
    if "is_active" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 0")
    if "is_verified" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT 0")
    if "otp_code" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN otp_code VARCHAR(10) NULL")
    if "otp_expires_at" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN otp_expires_at DATETIME NULL")
    if "trusted_contact_name" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN trusted_contact_name VARCHAR(100) NULL")
    if "trusted_contact_phone" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN trusted_contact_phone VARCHAR(15) NULL")
    if "guardian_name" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN guardian_name VARCHAR(100) NULL")
    if "guardian_phone" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN guardian_phone VARCHAR(15) NULL")
    if "guardian_relation" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN guardian_relation VARCHAR(50) NULL")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_sos_columns(engine):
    inspector = inspect(engine)
    if "sos_alerts" not in inspector.get_table_names():
        return

    existing_columns = {column["name"] for column in inspector.get_columns("sos_alerts")}
    statements = []

    if "message" not in existing_columns:
        statements.append("ALTER TABLE sos_alerts ADD COLUMN message TEXT NULL")
    if "resolved_at" not in existing_columns:
        statements.append("ALTER TABLE sos_alerts ADD COLUMN resolved_at DATETIME NULL")

    if not statements:
        return

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


class PendingRegistration(Base):
    __tablename__ = "pending_registrations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    email = Column(String(100), unique=True, index=True)
    phone = Column(String(15))
    password_hash = Column(String(256))
    otp_code = Column(String(10))
    otp_expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
