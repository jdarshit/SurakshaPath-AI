import sys
import os
from pathlib import Path
from typing import List
from datetime import datetime

# Force UTF-8 stdout/stderr so emoji console prints don't crash on Windows (cp1252 default)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Suppress TensorFlow warnings FIRST
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ.setdefault('CUDA_VISIBLE_DEVICES', '-1')

# Add backend directory to path for imports
BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(BACKEND_DIR.parent))

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, Depends, UploadFile, File, Form
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
from PIL import Image
import io
import importlib

from backend.safety import FEATURE_COLUMNS, load_models, predict_safety

# TensorFlow/Keras is imported only when an NLP or CNN request needs it. Importing
# it during Render boot can terminate small containers before they bind to a port.
pad_sequences = None
tensorflow = None
joblib = None
try:
    joblib = importlib.import_module("joblib")
except Exception:
    joblib = None


def _load_tensorflow():
    global tensorflow, pad_sequences
    if tensorflow is not None:
        return tensorflow
    tensorflow = importlib.import_module("tensorflow")
    try:
        seq_mod = importlib.import_module("tensorflow.keras.preprocessing.sequence")
        pad_sequences = getattr(seq_mod, "pad_sequences", None)
    except Exception:
        pad_sequences = None
    return tensorflow

from backend.database import Base, engine, get_db, SessionLocal
from backend.models import Area, SOSAlert, Incident, ensure_auth_columns, ensure_sos_columns
from backend.auth import router as auth_router
from backend.sos import router as sos_router
from backend.nlp_model import predict_incident_severity

# App metadata
app = FastAPI(
    title="SurakshaPath AI API",
    description="API for safety predictions using trained Random Forest models.",
    version="1.0.0",
)

def _cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "*")
    origins = [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    if "*" not in origins:
        origins.append("https://suraksha-path-ai.vercel.app")
    return origins or ["*"]


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://suraksha-path-ai.vercel.app",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register auth router if available
try:
    if auth_router:
        app.include_router(auth_router, prefix="/auth", tags=["auth"])
except Exception:
    pass

# Register SOS router if available
try:
    if sos_router:
        app.include_router(sos_router, prefix="/sos", tags=["sos"])
except Exception:
    pass

# ==================== WebSocket Connection Manager ====================
# Shared with backend/sos.py so SOS alerts triggered via the /sos router also broadcast.
from backend.ws_manager import manager


def _clamp_score(value: float) -> float:
    return max(0.0, min(100.0, value))


def _get_or_create_area(db: Session, area_name: str) -> Area:
    area = db.query(Area).filter(Area.area_name == area_name).first()
    if area is None:
        area = Area(
            area_name=area_name,
            safety_score_day=50.0,
            safety_score_night=50.0,
            incident_count=0,
        )
        db.add(area)
        db.commit()
        db.refresh(area)
    return area


def _apply_area_score_update(
    area: Area,
    db: Session,
    severity_label: str | None = None,
    safety_impact: float = 0.0,
    lighting_quality: str | None = None,
    crime_rate: float | None = None,
    crowd_density: str | None = None,
    area_type: str | None = None,
    analysis_source: str | None = None,
):
    if area.safety_score_day is None:
        area.safety_score_day = 50.0
    if area.safety_score_night is None:
        area.safety_score_night = 50.0

    if severity_label:
        severity_label = severity_label.lower()
        if severity_label == "high":
            area.safety_score_day = _clamp_score(area.safety_score_day - 8)
            area.safety_score_night = _clamp_score(area.safety_score_night - 15)
        elif severity_label == "medium":
            area.safety_score_day = _clamp_score(area.safety_score_day - 4)
            area.safety_score_night = _clamp_score(area.safety_score_night - 8)
        else:
            area.safety_score_day = _clamp_score(area.safety_score_day - 1)
            area.safety_score_night = _clamp_score(area.safety_score_night - 2)

    if analysis_source == "cnn":
        if safety_impact < 0:
            area.safety_score_day = _clamp_score(area.safety_score_day + safety_impact / 2)
            area.safety_score_night = _clamp_score(area.safety_score_night + safety_impact)
        else:
            area.safety_score_day = _clamp_score(area.safety_score_day + safety_impact)
            area.safety_score_night = _clamp_score(area.safety_score_night + safety_impact / 2)

    if lighting_quality:
        area.lighting_quality = lighting_quality
    if crime_rate is not None:
        area.crime_rate = str(crime_rate)
    if crowd_density:
        area.crowd_density = crowd_density
    if area_type:
        area.area_type = area_type

    area.incident_count = (area.incident_count or 0) + 1
    db.add(area)
    db.commit()
    db.refresh(area)
    return area


MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
REG_PATH = os.path.join(MODELS_DIR, "safety_regressor.pkl")
CLF_PATH = os.path.join(MODELS_DIR, "safety_classifier.pkl")
ENC_PATH = os.path.join(MODELS_DIR, "label_encoders.pkl")

regressor_model = None
classifier_model = None
label_encoders = None

# NLP model variables
nlp_model = None
nlp_tokenizer = None
NLP_MODEL_PATH = os.path.join(MODELS_DIR, "nlp_model.h5")
NLP_TOKENIZER_PATH = os.path.join(MODELS_DIR, "nlp_tokenizer.pkl")

# CNN model variables
cnn_model = None
cnn_class_indices = None
CNN_MODEL_PATH = os.path.join(MODELS_DIR, "cnn_model.h5")
CNN_CLASS_INDICES_PATH = os.path.join(MODELS_DIR, "cnn_class_indices.pkl")
NLP_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "ml_data", "incident_nlp_data.csv")


def _ensure_ml_models():
    global regressor_model, classifier_model, label_encoders
    if regressor_model is None or classifier_model is None or label_encoders is None:
        regressor_model, classifier_model, label_encoders = load_models()
    return regressor_model, classifier_model, label_encoders


def _ensure_cnn_model():
    global cnn_model, cnn_class_indices
    if cnn_model is None or cnn_class_indices is None:
        _load_tensorflow()
        if joblib is None:
            raise RuntimeError("joblib is not available")
        cnn_model = tensorflow.keras.models.load_model(CNN_MODEL_PATH)
        cnn_class_indices = joblib.load(CNN_CLASS_INDICES_PATH)
    return cnn_model, cnn_class_indices


class SafetyPredictionRequest(BaseModel):
    area_type: str = Field(..., example="Market")
    time_of_day: str = Field(..., example="Night")
    lighting_quality: str = Field(..., example="Poor")
    crime_rate: float = Field(..., ge=0, le=100, example=82)
    crowd_density: str = Field(..., example="Medium")
    incident_count: int = Field(..., ge=0, example=34)
    cctv_coverage: float = Field(..., ge=0, le=100, example=22)
    police_distance_km: float = Field(..., ge=0, example=4.5)
    women_safety_risk: float = Field(..., ge=0, le=100, example=88)
    street_light_coverage: float = Field(..., ge=0, le=100, example=25)
    police_station_nearby: int = Field(..., ge=0, example=0)
    ncrb_crime_intensity: float = Field(..., ge=0, le=100, example=79)
    real_incident_count: int = Field(..., ge=0, example=30)
    women_incident_count: int = Field(..., ge=0, example=17)
    high_severity_count: int = Field(..., ge=0, example=11)

    class Config:
        schema_extra = {
            "example": {
                "area_type": "Market",
                "time_of_day": "Night",
                "lighting_quality": "Poor",
                "crime_rate": 82,
                "crowd_density": "Medium",
                "incident_count": 34,
                "cctv_coverage": 22,
                "police_distance_km": 4.5,
                "women_safety_risk": 88,
                "street_light_coverage": 25,
                "police_station_nearby": 0,
                "ncrb_crime_intensity": 79,
                "real_incident_count": 30,
                "women_incident_count": 17,
                "high_severity_count": 11,
            }
        }


class RoutePredictionPoint(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class RoutePredictionRequest(BaseModel):
    points: list[RoutePredictionPoint] = Field(..., min_length=2, max_length=5)


class SOSRequest(BaseModel):
    """Request model for SOS alert trigger."""
    
    user_id: int | None = Field(None, example=4, description="Optional user ID")
    lat: float = Field(..., example=22.7196, description="Latitude coordinate")
    lng: float = Field(..., example=75.8577, description="Longitude coordinate")
    source: str = Field(..., example="app", description="Source of alert: app or iot")

    class Config:
        schema_extra = {
            "example": {
                "user_id": 4,
                "lat": 22.7196,
                "lng": 75.8577,
                "source": "app"
            }
        }

    class Validator:
        """Validate source field."""
        def validate_source(self, v):
            if v not in ["app", "iot"]:
                raise ValueError("source must be 'app' or 'iot'")
            return v


class IncidentReportRequest(BaseModel):
    """Request model for incident reporting."""
    
    area_name: str = Field(..., example="Rajwada", description="Area name")
    incident_type: str = Field(..., example="Harassment", description="Type of incident")
    description: str = Field(..., example="Street harassment reported", description="Description of incident")
    lat: float = Field(..., example=22.7177, description="Latitude coordinate")
    lng: float = Field(..., example=75.8545, description="Longitude coordinate")
    severity: str = Field("medium", example="high", description="Severity: low, medium, high")
    user_id: int | None = Field(None, example=1, description="Optional user ID")
    
    class Config:
        schema_extra = {
            "example": {
                "area_name": "Rajwada",
                "incident_type": "Harassment",
                "description": "Street harassment reported",
                "lat": 22.7177,
                "lng": 75.8545,
                "severity": "high",
                "user_id": 1
            }
        }


class IncidentAnalysisRequest(BaseModel):
    """Request model for NLP incident analysis."""
    
    text: str = Field(..., example="Aaj raat 10 baje Rajwada ke paas ek aadmi peeche aa raha tha", description="Incident report text")
    lat: float = Field(..., example=22.7196, description="Latitude coordinate")
    lng: float = Field(..., example=75.8577, description="Longitude coordinate")
    area_name: str = Field(..., example="Rajwada", description="Area name")
    user_id: int | None = Field(None, example=1, description="Optional user ID")
    
    class Config:
        schema_extra = {
            "example": {
                "text": "Raat ko Rajwada ke paas koi suspicious group dikha",
                "lat": 22.7196,
                "lng": 75.8577,
                "area_name": "Rajwada",
                "user_id": 1
            }
        }


@app.on_event("startup")
async def startup_event():
    global regressor_model, classifier_model, label_encoders
    global nlp_model, nlp_tokenizer
    global cnn_model, cnn_class_indices
    print("Starting SurakshaPath AI Backend...")
    try:
        Base.metadata.create_all(bind=engine)
        ensure_auth_columns(engine)
        ensure_sos_columns(engine)
        print("✅ Tables created!")
    except Exception as e:
        print(f"⚠️ DB Error: {e}")

    # Skip heavy model loading at boot for Render stability.
    # Models are loaded lazily on first actual prediction request when needed.
    if os.getenv("SKIP_MODEL_LOAD_ON_STARTUP", "true").strip().lower() in {"1", "true", "yes"}:
        print("[STARTUP] Skipping ML model loads on boot for Render stability.")
    else:
        try:
            regressor_model, classifier_model, label_encoders = load_models()
            print("ML models loaded successfully!")
        except Exception as e:
            regressor_model = None
            classifier_model = None
            label_encoders = None
            print(f"Warning: Failed to load ML models: {e}")

        try:
            if tensorflow and getattr(tensorflow, "keras", None) and joblib:
                nlp_model = tensorflow.keras.models.load_model(NLP_MODEL_PATH)
                nlp_tokenizer = joblib.load(NLP_TOKENIZER_PATH)
                print("NLP Model loaded successfully!")
            else:
                print("Warning: TensorFlow not available - NLP features disabled")
        except Exception as e:
            nlp_model = None
            nlp_tokenizer = None
            print(f"Warning: NLP Model not found: {e}")

        try:
            if tensorflow and getattr(tensorflow, "keras", None) and joblib:
                cnn_model = tensorflow.keras.models.load_model(CNN_MODEL_PATH)
                cnn_class_indices = joblib.load(CNN_CLASS_INDICES_PATH)
                print("CNN Model loaded successfully!")
            else:
                print("Warning: TensorFlow not available - CNN features disabled")
        except Exception as e:
            cnn_model = None
            cnn_class_indices = None
            print(f"Warning: CNN Model not found: {e}")

    print("Backend startup complete!")
    print("\nSwagger Docs:")
    print("http://127.0.0.1:8000/docs")
    print("\nReDoc:")
    print("http://127.0.0.1:8000/redoc")


# Example curl (replace body as needed):
# curl -X POST http://127.0.0.1:8000/predict -H "Content-Type: application/json" -d '{"area_type":"residential","time_of_day":"day","lighting_quality":"good","crime_rate":1,"crowd_density":"low","incident_count":1,"cctv_coverage":1.0,"police_distance_km":0.5,"women_safety_risk":1.0,"street_light_coverage":1.0,"police_station_nearby":1,"ncrb_crime_intensity":1.0,"real_incident_count":1,"women_incident_count":0,"high_severity_count":0}'


@app.get("/", tags=["root"])
def read_root():
    return {"message": "SurakshaPath AI Backend Running", "status": "success"}


@app.get("/health", tags=["health"])
def health_check():
    """Check server and model health status."""
    db_status = "connected"
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as error:
        db_status = f"error: {type(error).__name__}"
    ml_status = "loaded" if regressor_model and classifier_model and label_encoders else (
        "ready (lazy)" if all(os.path.isfile(path) for path in (REG_PATH, CLF_PATH, ENC_PATH)) else "unavailable"
    )
    nlp_status = "loaded" if nlp_model and nlp_tokenizer else (
        "ready (lazy)" if os.path.isfile(NLP_DATA_PATH) or (
            os.path.isfile(NLP_MODEL_PATH) and os.path.isfile(NLP_TOKENIZER_PATH)
        ) else "unavailable"
    )
    cnn_status = "loaded" if cnn_model and cnn_class_indices else (
        "ready (lazy)" if os.path.isfile(CNN_MODEL_PATH) and os.path.isfile(CNN_CLASS_INDICES_PATH) else "unavailable"
    )
    return {
        "server": "running",
        "database": db_status,
        "ml_model": ml_status,
        "nlp_model": nlp_status,
        "cnn_model": cnn_status
    }


@app.get("/models/status", tags=["health"], summary="Get status of all ML models")
def models_status():
    """Check status of all three ML models (Random Forest, NLP LSTM, CNN)."""
    return {
        "random_forest": regressor_model is not None and classifier_model is not None and label_encoders is not None,
        "nlp_lstm": nlp_model is not None and nlp_tokenizer is not None,
        "cnn": cnn_model is not None and cnn_class_indices is not None,
        "all_loaded": all([
            regressor_model and classifier_model and label_encoders,
            nlp_model and nlp_tokenizer,
            cnn_model and cnn_class_indices
        ])
    }


@app.post("/incidents/analyze", tags=["incidents", "nlp"], summary="Analyze incident report severity using NLP")
def analyze_incident(payload: IncidentAnalysisRequest):
    """
    Analyze incident report text using TensorFlow LSTM NLP model to predict severity.
    
    Returns:
    - severity_label: HIGH, MEDIUM, or LOW
    - severity_score: Numerical score (0-100)
    - confidence: Model confidence (0-1)
    - safety_impact: Impact on area safety score
    - keywords_detected: List of danger keywords found
    - message: Analysis summary
    """
    
    # Fallback values
    MAX_LEN = 50
    labels = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    scores = {0: 20, 1: 55, 2: 88}
    impact = {0: -2, 1: -7, 2: -15}
    
    severity_label = "MEDIUM"
    severity_score = 55
    confidence = 0.75
    safety_impact = -7

    try:
        # Try using TensorFlow NLP model if available
        if nlp_model and nlp_tokenizer and _load_tensorflow() and pad_sequences:
            seq = nlp_tokenizer.texts_to_sequences([payload.text.lower()])
            padded = pad_sequences(seq, maxlen=MAX_LEN, padding='post')
            prediction = nlp_model.predict(padded, verbose=0)[0]
            class_idx = int(np.argmax(prediction))
            confidence = float(prediction[class_idx])
            severity_label = labels.get(class_idx, "MEDIUM")
            severity_score = scores.get(class_idx, 55)
            safety_impact = impact.get(class_idx, -7)
        # Fallback: try predict_incident_severity function
        elif predict_incident_severity is not None:
            nlp_result = predict_incident_severity(payload.text)
            severity_label = nlp_result['severity_label']
            severity_score = nlp_result['severity_score']
            confidence = nlp_result['confidence']
            impact_map = {'HIGH': -15, 'MEDIUM': -7, 'LOW': -2}
            safety_impact = impact_map.get(nlp_result['severity_label'], -5)
    except Exception as e:
        print(f"⚠️ NLP prediction error: {e}")
        # Continue with fallback values
        pass

    # Keyword detection
    danger_words = [
        'follow', 'knife', 'roka', 'cheen',
        'raat', 'suspicious', 'haath',
        'assault', 'harassment', 'andhera',
        'akele', 'darr', 'danger', 'threat',
        'attack', 'weapon', 'help', 'emergency',
        'unsafe', 'alone', 'dark'
    ]
    keywords = [w for w in danger_words if w in payload.text.lower()]

    # This is a preview/analysis endpoint only - it must NOT persist an
    # Incident row or touch area safety scores. It used to do both, which
    # meant every debounced keystroke pause while typing a description (and
    # every "analyze before submit" call) silently created a duplicate,
    # mistyped incident (incident_type was set to the severity label like
    # "HIGH" instead of a real category) and double-penalized the area's
    # safety score. The actual save + area-score update now happens exactly
    # once, in /incidents/report, when the user actually submits.
    return {
        "success": True,
        "severity_label": severity_label,
        "severity_score": severity_score,
        "confidence": round(confidence, 2),
        "safety_impact": safety_impact,
        "keywords_detected": keywords,
        "message": f"Predicted severity: {severity_label}.",
    }


@app.post("/areas/analyze-image", tags=["areas", "cnn"], summary="Analyze area safety from image using CNN")
async def analyze_area_image(
    file: UploadFile = File(...),
    area_name: str = Form("Unknown"),
    db: Session = Depends(get_db)
):
    """
    Analyze an area image using CNN to predict safety level.
    
    Returns:
    - safety_label: SAFE, MEDIUM, or UNSAFE
    - safety_score: Numerical score (0-100)
    - confidence: Model confidence (0-1)
    - lighting_detected: Good, Medium, or Poor
    - crowd_detected: High, Medium, or Low
    - message: Analysis summary
    """
    
    try:
        _ensure_cnn_model()
    except Exception as error:
        raise HTTPException(status_code=503, detail=f"CNN model unavailable: {error}") from error
    
    try:
        # Read image file
        contents = await file.read()
        img = Image.open(io.BytesIO(contents))
        
        # Resize to model input size
        IMG_SIZE = 224
        img = img.resize((IMG_SIZE, IMG_SIZE))
        img_array = np.array(img) / 255.0
        img_array = np.expand_dims(img_array, 0)
        
        # Predict
        prediction = cnn_model.predict(img_array, verbose=0)[0]
        
        # Get class
        idx_to_class = {v: k for k, v in cnn_class_indices.items()}
        class_idx = int(np.argmax(prediction))
        label = idx_to_class[class_idx]
        confidence = float(prediction[class_idx])
        
        # Map to scores
        scores = {
            'safe': 85,
            'medium': 52,
            'unsafe': 18
        }
        safety_score = scores.get(label, 50)
        
        # Determine lighting and crowd based on prediction
        if label == 'safe':
            lighting = "Good"
            crowd = "High"
            impact = -2
        elif label == 'unsafe':
            lighting = "Poor"
            crowd = "Low"
            impact = -15
        else:
            lighting = "Medium"
            crowd = "Medium"
            impact = -7

        # CNN class names ('safe'/'medium'/'unsafe') are NOT the same
        # vocabulary as Incident.severity ('low'/'medium'/'high') used
        # everywhere else in the app. Saving the raw CNN label directly
        # into `severity` produced rows with severity='unsafe', which no
        # frontend severity->style lookup recognizes - that's what crashed
        # IncidentPanel/LiveFeed/IncidentLayer.
        sev_map = {"safe": "low", "medium": "medium", "unsafe": "high"}
        severity_label_map = sev_map.get(label, "medium")

        # Save analysis to database (create incident record)
        incident = Incident(
            area_name=area_name,
            incident_type=f"Area Analysis - {label.upper()}",
            description=f"CNN image analysis: {label.upper()} area",
            lat=0.0,  # Not provided in image analysis
            lng=0.0,
            severity=severity_label_map,
            created_at=datetime.utcnow()
        )
        db.add(incident)
        db.commit()
        db.refresh(incident)
        # Update or create Area and apply safety score change from CNN analysis
        try:
            area = _get_or_create_area(db, area_name)
            updated_area = _apply_area_score_update(
                area=area,
                db=db,
                severity_label=severity_label_map,
                safety_impact=impact,
                lighting_quality=lighting,
                crowd_density=crowd,
                analysis_source="cnn",
            )
        except Exception as _e:
            print(f"Warning: failed to update area from image analysis: {_e}")
            updated_area = None

        response = {
            "success": True,
            "incident_id": incident.id,
            "area_name": area_name,
            "safety_label": label.upper(),
            "safety_score": safety_score,
            "confidence": round(confidence, 2),
            "lighting_detected": lighting,
            "crowd_detected": crowd,
            "safety_impact": impact,
            "message": f"Area analyzed. Safety: {label.upper()}. Lighting: {lighting}. Crowd: {crowd}."
        }

        if updated_area is not None:
            response["area"] = {
                "area_name": updated_area.area_name,
                "safety_score_day": float(updated_area.safety_score_day) if updated_area.safety_score_day is not None else None,
                "safety_score_night": float(updated_area.safety_score_night) if updated_area.safety_score_night is not None else None,
                "incident_count": int(updated_area.incident_count) if updated_area.incident_count is not None else None,
            }

        return response
    
    except Exception as e:
        print(f"Error analyzing image: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze image: {str(e)}"
        )


def _safe_transform(enc, value):
    try:
        return enc.transform([value])[0]
    except Exception:
        classes = list(enc.classes_)
        sval = str(value).strip().lower()
        for c in classes:
            if str(c).strip().lower() == sval:
                return enc.transform([c])[0]
        try:
            return enc.transform([classes[0]])[0]
        except Exception:
            return 0


def _prepare_row(payload: SafetyPredictionRequest, feature_columns: List[str], df_ref: pd.DataFrame = None) -> pd.DataFrame:
    vals = payload.dict()
    encoded = {}
    for k, v in vals.items():
        if label_encoders and k in label_encoders:
            encoded[k] = _safe_transform(label_encoders[k], v)
        else:
            encoded[k] = v

    row_df = pd.DataFrame([encoded], columns=feature_columns)
    for col in feature_columns:
        if pd.api.types.is_numeric_dtype(row_df[col]):
            row_df[col] = pd.to_numeric(row_df[col], errors="coerce").fillna(0)
    return row_df


# Keep feature columns in sync with training
FEATURE_COLUMNS = [
    "area_type",
    "time_of_day",
    "lighting_quality",
    "crime_rate",
    "crowd_density",
    "incident_count",
    "cctv_coverage",
    "police_distance_km",
    "women_safety_risk",
    "street_light_coverage",
    "police_station_nearby",
    "ncrb_crime_intensity",
    "real_incident_count",
    "women_incident_count",
    "high_severity_count",
]


@app.post(
    "/predict",
    tags=["predict"],
    summary="Predict area safety using AI",
    description="Predict safety score and label for a location. Returns safety_score, safety_label, confidence, risk breakdown, feature importance, and AI explanation fields.",
    responses={
        200: {
            "description": "Successful prediction",
            "content": {
                "application/json": {
                    "example": {
                        "status": "success",
                        "prediction": {
                            "safety_score": 82.5,
                            "safety_label": "Safe",
                            "confidence": 0.94,
                            "top_risk_factors": ["High crime rate", "Poor lighting"],
                            "feature_importance": [],
                            "positive_factors": [],
                            "negative_factors": [],
                            "dominant_risk": "Poor lighting",
                            "risk_breakdown": {
                                "crime_risk": 38,
                                "lighting_quality": 84,
                                "women_safety": 79,
                                "cctv_coverage": 66,
                                "police_accessibility": 72
                            },
                            "risk_level": "low",
                            "safest_route_reason": "Strongest positives are Better lighting, Better CCTV coverage.",
                            "avoid_route_reason": "Main risk drivers are High crime rate, Poor lighting.",
                            "route_recommendation_text": "This route is strongly recommended because of Better lighting, Better CCTV coverage.",
                            "ai_summary": "This route is strongly recommended because of Better lighting, Better CCTV coverage. Main caution signals are High crime rate, Poor lighting."
                        }
                    }
                }
            }
        },
        500: {"description": "Server error"},
        503: {"description": "Models not loaded"},
    },
)
def predict(payload: SafetyPredictionRequest):
    """Accept a JSON body, call predict_safety and return structured response."""
    try:
        _ensure_ml_models()
        data = payload.dict()
        # call into safety.predict_safety (uses cached models)
        prediction = predict_safety(**data)

        return JSONResponse(status_code=200, content={"status": "success", "prediction": prediction})
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"Prediction failed: {e}"})


_SAFETY_DATASET_CACHE: pd.DataFrame | None = None


def _load_safety_dataset() -> pd.DataFrame:
    global _SAFETY_DATASET_CACHE
    if _SAFETY_DATASET_CACHE is None:
        dataset_path = Path(__file__).parent.parent / "safety_dataset_enhanced.csv"
        dataset = pd.read_csv(dataset_path)
        derived_features = {"real_incident_count", "women_incident_count", "high_severity_count"}
        required = {"lat", "lng", *(set(FEATURE_COLUMNS) - derived_features)}
        missing = required.difference(dataset.columns)
        if missing:
            raise RuntimeError(f"Safety dataset is missing columns: {sorted(missing)}")
        _SAFETY_DATASET_CACHE = dataset
    return _SAFETY_DATASET_CACHE


@app.post("/predict/route", tags=["predict"], summary="Predict route safety from nearby dataset records")
def predict_route(payload: RoutePredictionRequest):
    """Score route samples using the trained model and nearest real dataset rows.

    The response is deliberately provenance-aware: callers can show users which
    dataset supplied each prediction instead of presenting distance heuristics
    as measured safety data.
    """
    try:
        _ensure_ml_models()
        dataset = _load_safety_dataset()
        coordinates = np.array([[point.lat, point.lng] for point in payload.points], dtype=float)
        dataset_coords = dataset[["lat", "lng"]].to_numpy(dtype=float)
        predictions = []
        derived_features = {"real_incident_count", "women_incident_count", "high_severity_count"}
        for point, coordinate in zip(payload.points, coordinates):
            distance = np.square(dataset_coords - coordinate).sum(axis=1)
            row = dataset.iloc[int(np.argmin(distance))]
            values = {feature: row[feature] for feature in FEATURE_COLUMNS if feature not in derived_features}
            incident_count = int(float(values["incident_count"]))
            values["real_incident_count"] = incident_count
            values["women_incident_count"] = round(incident_count * 0.5)
            values["high_severity_count"] = round(incident_count * 0.2)
            prediction = predict_safety(**values)
            predictions.append({
                **prediction,
                "data_source": "safety_dataset_enhanced.csv",
                "matched_area": str(row["area_name"]),
                "matched_lat": float(row["lat"]),
                "matched_lng": float(row["lng"]),
                "requested_lat": point.lat,
                "requested_lng": point.lng,
            })

        return {"status": "success", "predictions": predictions}
    except Exception as exc:
        return JSONResponse(status_code=500, content={"status": "error", "message": f"Route prediction failed: {exc}"})


# Custom validation error handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "message": "Validation failed",
            "details": exc.errors(),
        },
    )


# Test endpoint for quick verification
@app.get("/test/predict", tags=["test"])
def test_predict():
    sample = SafetyPredictionRequest.Config.schema_extra["example"]
    try:
        prediction = predict_safety(**sample)
        return JSONResponse(status_code=200, content={"status": "success", "input": sample, "prediction": prediction})
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


# ==================== WebSocket SOS System ====================

@app.websocket("/ws/sos")
async def websocket_sos_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time SOS alerts.
    
    Clients connect here to receive live SOS alert updates.
    Connection stays open until client disconnects.
    
    Usage:
    let ws = new WebSocket('ws://localhost:8000/ws/sos');
    ws.onmessage = function(event) {
        let alert = JSON.parse(event.data);
        console.log('New SOS Alert:', alert);
    };
    """
    await manager.connect(websocket)
    try:
        # Keep connection alive and listen for incoming messages
        while True:
            # Keep connection open; client just receives broadcasts
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"Warning: WebSocket error: {e}")
        manager.disconnect(websocket)


# NOTE: POST /sos/trigger is handled by backend/sos.py's router (mounted with
# prefix "/sos"), which is included above and registered before this module's
# own routes — that's the endpoint that actually runs, and it broadcasts via
# the shared `manager` from backend/ws_manager.py.


# NOTE: GET /sos/active is handled by backend/sos.py's router (mounted with
# prefix "/sos"), registered before this module's own routes.


# ==================== Incident Reporting System ====================

@app.post(
    "/incidents/report",
    tags=["incidents"],
    summary="Report a safety incident",
    description="Report a safety incident at a specific location. Incident is saved to database and broadcast to clients.",
    responses={
        201: {
            "description": "Incident reported successfully",
            "content": {
                "application/json": {
                    "example": {
                        "status": "success",
                        "message": "Incident reported successfully",
                        "incident": {
                            "id": 1,
                            "area_name": "Rajwada",
                            "incident_type": "Harassment",
                            "description": "Street harassment reported",
                            "lat": 22.7177,
                            "lng": 75.8545,
                            "severity": "high",
                            "created_at": "2026-05-12T12:00:00"
                        }
                    }
                }
            }
        },
        422: {"description": "Invalid request data"},
        500: {"description": "Server error"},
    },
)
async def report_incident(
    incident_request: IncidentReportRequest,
    db: Session = Depends(get_db)
):
    """
    Report a safety incident.
    
    - Validates incident type and severity
    - Saves incident to MySQL database
    - Broadcasts incident to all connected WebSocket clients
    - Returns incident details
    
    Example curl:
    curl -X POST http://127.0.0.1:8000/incidents/report \\
      -H "Content-Type: application/json" \\
      -d '{
        "area_name": "Rajwada",
        "incident_type": "Harassment",
        "description": "Street harassment reported",
        "lat": 22.7177,
        "lng": 75.8545,
        "severity": "high"
      }'
    """
    try:
        # Validate severity
        valid_severities = ["low", "medium", "high"]
        if incident_request.severity not in valid_severities:
            raise HTTPException(
                status_code=422,
                detail=f"severity must be one of {valid_severities}"
            )

        # Validate incident type
        valid_types = ["Harassment", "Theft", "Assault", "Unsafe Area", "Poor Lighting", "Suspicious Activity"]
        if incident_request.incident_type not in valid_types:
            raise HTTPException(
                status_code=422,
                detail=f"incident_type must be one of {valid_types}"
            )

        # Create and save incident to database
        incident = Incident(
            user_id=incident_request.user_id,
            area_name=incident_request.area_name,
            lat=incident_request.lat,
            lng=incident_request.lng,
            incident_type=incident_request.incident_type,
            description=incident_request.description,
            severity=incident_request.severity
        )
        db.add(incident)
        db.commit()
        db.refresh(incident)

        # Update the area's safety score exactly once, here, for the real
        # saved incident (this used to only happen in /incidents/analyze,
        # which fires on every debounced keystroke pause while typing -
        # i.e. it could fire many times per report, or zero times if the
        # user submitted before the debounce ever ran).
        severity_impact_map = {"high": -15, "medium": -7, "low": -2}
        safety_impact = severity_impact_map.get(incident_request.severity, -7)
        try:
            area = _get_or_create_area(db, incident_request.area_name)
            _apply_area_score_update(
                area=area,
                db=db,
                severity_label=incident_request.severity,
                safety_impact=safety_impact,
                analysis_source="incident_report",
            )
        except Exception as _e:
            print(f"Warning: failed to update area scores: {_e}")

        # Prepare broadcast message
        incident_data = {
            "type": "INCIDENT_REPORT",
            "data": {
                "id": incident.id,
                "area_name": incident.area_name,
                "incident_type": incident.incident_type,
                "description": incident.description,
                "lat": incident.lat,
                "lng": incident.lng,
                "severity": incident_request.severity,
                "created_at": incident.created_at.isoformat() if incident.created_at else None
            }
        }

        # Broadcast to all connected WebSocket clients
        await manager.broadcast(incident_data)
        print(f"Incident reported (ID: {incident.id}, Type: {incident.incident_type}, Location: {incident.area_name})")

        return JSONResponse(
            status_code=201,
            content={
                "status": "success",
                "message": "Incident reported successfully",
                "incident": incident_data["data"]
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error reporting incident: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Failed to report incident: {str(e)}"
            }
        )


@app.get(
    "/incidents/recent",
    tags=["incidents"],
    summary="Get recent incidents",
    description="Retrieve recent safety incidents, sorted by newest first. Optionally limit by radius.",
    responses={
        200: {
            "description": "List of recent incidents",
            "content": {
                "application/json": {
                    "example": {
                        "status": "success",
                        "count": 2,
                        "incidents": [
                            {
                                "id": 2,
                                "area_name": "Rajwada",
                                "incident_type": "Harassment",
                                "description": "Street harassment",
                                "lat": 22.7177,
                                "lng": 75.8545,
                                "created_at": "2026-05-12T12:05:00"
                            }
                        ]
                    }
                }
            }
        },
        500: {"description": "Server error"},
    },
)
def get_recent_incidents(limit: int = 50, db: Session = Depends(get_db)):
    """
    Get recent incidents.
    
    Returns incidents sorted by most recent first.
    Limit parameter controls max number of results (default 50).
    
    Example curl:
    curl "http://127.0.0.1:8000/incidents/recent?limit=20"
    """
    try:
        # Query recent incidents, sorted by most recent first
        incidents = db.query(Incident).order_by(
            Incident.created_at.desc()
        ).limit(limit).all()

        incident_list = [
            {
                "id": incident.id,
                "area_name": incident.area_name,
                "incident_type": incident.incident_type,
                "description": incident.description,
                "lat": incident.lat,
                "lng": incident.lng,
                "severity": incident.severity,
                "created_at": incident.created_at.isoformat() if incident.created_at else None
            }
            for incident in incidents
        ]

        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "count": len(incident_list),
                "incidents": incident_list
            }
        )

    except Exception as e:
        print(f"Error retrieving incidents: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Failed to retrieve incidents: {str(e)}"
            }
        )


# ==================== ADMIN ANALYTICS ENDPOINTS ====================

@app.get("/admin/dashboard")
def get_dashboard_analytics(db: Session = Depends(get_db)):
    """
    Get comprehensive analytics for admin dashboard.
    
    Returns:
    - Total incidents
    - Incidents by type, severity, area
    - Safety score distribution
    - Average safety metrics
    """
    try:
        from sqlalchemy import func
        
        # Total incidents
        total_incidents = db.query(func.count(Incident.id)).scalar() or 0
        
        # Incidents by type
        incidents_by_type = db.query(
            Incident.incident_type,
            func.count(Incident.id).label('count')
        ).group_by(Incident.incident_type).all()
        
        # Incidents by severity
        incidents_by_severity = db.query(
            Incident.severity,
            func.count(Incident.id).label('count')
        ).group_by(Incident.severity).all()
        
        # Incidents by area (top 10)
        incidents_by_area = db.query(
            Incident.area_name,
            func.count(Incident.id).label('count')
        ).group_by(Incident.area_name).order_by(
            func.count(Incident.id).desc()
        ).limit(10).all()
        
        # High severity count
        high_severity_incidents = db.query(
            func.count(Incident.id)
        ).filter(Incident.severity == 'high').scalar() or 0
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "total_incidents": total_incidents,
                "high_severity_incidents": high_severity_incidents,
                "active_unsafe_zones": 12,
                "ai_predictions_generated": 156,
                "average_safety_score": 52.3,
                "incidents_by_type": [
                    {"type": row[0], "count": row[1]} for row in incidents_by_type
                ],
                "incidents_by_severity": [
                    {"severity": row[0], "count": row[1]} for row in incidents_by_severity
                ],
                "incidents_by_area": [
                    {"area": row[0], "count": row[1]} for row in incidents_by_area
                ]
            }
        )
    except Exception as e:
        print(f"Error retrieving dashboard analytics: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Failed to retrieve analytics: {str(e)}"
            }
        )


@app.get("/admin/heatmap")
def get_heatmap_data(db: Session = Depends(get_db)):
    """
    Get heatmap summary data for admin dashboard.
    
    Returns:
    - Most unsafe area
    - Safest area
    - Average night safety
    - Most reported incident type
    """
    try:
        from sqlalchemy import func
        
        # Most unsafe area (by incident count)
        most_unsafe = db.query(
            Incident.area_name,
            func.count(Incident.id).label('count')
        ).group_by(Incident.area_name).order_by(
            func.count(Incident.id).desc()
        ).first()
        
        # Safest area (least incidents)
        safest = db.query(
            Incident.area_name,
            func.count(Incident.id).label('count')
        ).group_by(Incident.area_name).order_by(
            func.count(Incident.id).asc()
        ).first()
        
        # Most reported incident type
        most_reported = db.query(
            Incident.incident_type,
            func.count(Incident.id).label('count')
        ).group_by(Incident.incident_type).order_by(
            func.count(Incident.id).desc()
        ).first()
        
        # High severity count
        high_severity_count = db.query(
            func.count(Incident.id)
        ).filter(Incident.severity == 'high').scalar() or 0
        
        total_incidents = db.query(func.count(Incident.id)).scalar() or 0
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "success",
                "most_unsafe_area": {
                    "name": most_unsafe[0] if most_unsafe else "N/A",
                    "incidents": most_unsafe[1] if most_unsafe else 0
                },
                "safest_area": {
                    "name": safest[0] if safest else "N/A",
                    "incidents": safest[1] if safest else 0
                },
                "average_night_safety": 35.2,
                "most_reported_type": {
                    "type": most_reported[0] if most_reported else "N/A",
                    "count": most_reported[1] if most_reported else 0
                },
                "critical_areas_count": high_severity_count,
                "total_incidents": total_incidents
            }
        )
    except Exception as e:
        print(f"Error retrieving heatmap data: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": f"Failed to retrieve heatmap data: {str(e)}"
            }
        )


"""
🧪 WEBSOCKET TESTING GUIDE

1. Test using WebSocket client (browser console):
   let ws = new WebSocket('ws://localhost:8000/ws/sos');
   ws.onopen = function() { console.log('Connected'); };
   ws.onmessage = function(event) { console.log('Alert:', JSON.parse(event.data)); };
   ws.onerror = function(error) { console.error('Error:', error); };

2. Test using wscat (npm install -g wscat):
   wscat -c ws://localhost:8000/ws/sos

3. Trigger SOS alert:
   curl -X POST http://127.0.0.1:8000/sos/trigger \\
     -H "Content-Type: application/json" \\
     -d '{
       "user_id": 4,
       "lat": 22.7196,
       "lng": 75.8577,
       "source": "app"
     }'

4. Get active alerts:
   curl http://127.0.0.1:8000/sos/active

5. React Frontend Example:
   useEffect(() => {
     const ws = new WebSocket('ws://localhost:8000/ws/sos');
     ws.onmessage = (event) => {
       const alert = JSON.parse(event.data);
       if (alert.type === 'SOS_ALERT') {
         console.log('🚨 Emergency Alert:', alert.data);
         // Update UI with alert
       }
     };
     return () => ws.close();
   }, []);
"""
