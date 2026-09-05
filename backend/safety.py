import os
import joblib
import numpy as np
import pandas as pd
from typing import Tuple, Dict, Any, List, Optional
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split

# =========================================================
# Constants
# =========================================================
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

TARGET_REGRESSION = "safety_score"
TARGET_CLASSIFICATION = "safety_label"

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
REG_PATH = os.path.join(MODELS_DIR, "safety_regressor.pkl")
CLF_PATH = os.path.join(MODELS_DIR, "safety_classifier.pkl")
ENC_PATH = os.path.join(MODELS_DIR, "label_encoders.pkl")

# Columns that can be synthesized from incident_count if missing in source dataset
SYNTH_COLS = ["real_incident_count", "women_incident_count", "high_severity_count"]

# =========================================================
# Module-level cache for loaded models to avoid repeated disk IO
# =========================================================
_MODEL_CACHE: Dict[str, Any] = {}


# =========================================================
# Utilities
# =========================================================

def resolve_dataset_path() -> str:
    """Return best candidate path for dataset (keeps previous behavior)."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(base_dir, os.pardir))

    candidate_paths = [
        os.path.abspath(os.path.join(base_dir, "..", "ml_data", "safety_dataset_final.csv")),
        os.path.abspath(os.path.join(project_root, "ml_data", "safety_dataset_final.csv")),
        os.path.abspath(os.path.join(project_root, "safety_dataset_final.csv")),
        os.path.abspath(os.path.join(project_root, "safety_dataset_enhanced.csv")),
    ]

    for candidate in candidate_paths:
        if os.path.isfile(candidate):
            return candidate

    raise FileNotFoundError("Dataset not found. Checked: " + " | ".join(candidate_paths))


def _get_float_env(name: str, default: float) -> float:
    v = os.getenv(name)
    if v is None:
        return default
    try:
        return float(v)
    except Exception:
        return default


def _safe_label_transform(enc: LabelEncoder, value: Any) -> int:
    """Transform value using encoder with resilient matching for string values."""
    try:
        return int(enc.transform([value])[0])
    except Exception:
        sval = str(value).strip().lower()
        for c in enc.classes_:
            if str(c).strip().lower() == sval:
                return int(enc.transform([c])[0])
        # fallback to 0
        try:
            return int(enc.transform([enc.classes_[0]])[0])
        except Exception:
            return 0


def _human_label(feature: str, direction: str) -> str:
    if direction == "positive":
        mapping = {
            "crime_rate": "Low crime rate",
            "lighting_quality": "Good lighting",
            "police_distance_km": "Nearby police station",
            "crowd_density": "Low crowd density",
            "incident_count": "Few incidents",
            "real_incident_count": "Few real incidents",
            "women_incident_count": "Few incidents involving women",
            "high_severity_count": "Few high-severity incidents",
            "cctv_coverage": "High CCTV coverage",
            "women_safety_risk": "Low women safety risk",
            "street_light_coverage": "Good street lighting",
            "ncrb_crime_intensity": "Low NCRB crime intensity",
            "time_of_day": "Daytime",
            "area_type": "Safe area type",
            "police_station_nearby": "Nearby police station",
        }
    else:
        mapping = {
            "crime_rate": "High crime rate",
            "lighting_quality": "Poor lighting",
            "police_distance_km": "Long police distance",
            "crowd_density": "High crowd density",
            "incident_count": "Many incidents",
            "real_incident_count": "Many real incidents",
            "women_incident_count": "Many incidents involving women",
            "high_severity_count": "Many high-severity incidents",
            "cctv_coverage": "Low CCTV coverage",
            "women_safety_risk": "High women safety risk",
            "street_light_coverage": "Poor street lighting",
            "ncrb_crime_intensity": "High NCRB crime intensity",
            "time_of_day": "Nighttime",
            "area_type": "Risky area type",
            "police_station_nearby": "No nearby police station",
        }
    return mapping.get(feature, feature.replace("_", " ").title())


def _feature_direction_score(feature: str, value: Any) -> Tuple[str, float, str]:
    """Return (direction, normalized_score, explanation) for explainability outputs."""
    text_value = str(value).strip().lower()

    if feature == "lighting_quality":
        if text_value in ["good", "bright"]: return "positive", 1.0, "Good lighting improves safety."
        else: return "negative", 1.0, "Poor lighting reduces safety."

    if feature == "crowd_density":
        if text_value in ["low"]: return "positive", 1.0, "Low crowd density improves safety."
        else: return "negative", 1.0, "High crowd density introduces risk."

    if feature == "time_of_day":
        if text_value in ["day", "daytime"]: return "positive", 1.0, "Daytime is generally safer."
        else: return "negative", 1.0, "Nighttime introduces risk."

    if feature == "area_type":
        if text_value in ["residential", "campus", "safe"]: return "positive", 1.0, "Safe area type."
        else: return "negative", 1.0, "Risky area type."

    if feature == "police_station_nearby":
        if text_value in ["1", "1.0", "true", "yes"]: return "positive", 1.0, "Nearby police station improves safety."
        else: return "negative", 1.0, "No nearby police station reduces safety."

    if feature in ["cctv_coverage", "street_light_coverage"]:
        if text_value in ["high", "good"]: return "positive", 1.0, "High coverage improves safety."
        if text_value in ["low", "poor", "medium"]: return "negative", 1.0, "Low coverage reduces safety."

    try:
        num = float(value)
    except Exception:
        num = 0.0

    if feature in ["crime_rate", "women_safety_risk", "ncrb_crime_intensity"]:
        if num < 50: return "positive", 1.0, "Low risk metric indicates safe conditions."
        else: return "negative", 1.0, "High risk metric indicates risky conditions."

    if feature in ["incident_count", "real_incident_count", "women_incident_count", "high_severity_count"]:
        if num < 5: return "positive", 1.0, "Few incidents indicate safe conditions."
        else: return "negative", 1.0, "Many incidents indicate risky conditions."

    if feature == "police_distance_km":
        if num <= 3.0: return "positive", 1.0, "Short police distance improves safety."
        else: return "negative", 1.0, "Long police distance reduces safety."

    if feature in ["cctv_coverage", "street_light_coverage"]:
        if num >= 50: return "positive", 1.0, "High coverage improves safety."
        else: return "negative", 1.0, "Low coverage reduces safety."

    return "negative", 1.0, "Assumed risky by default."


def _feature_display_value(feature: str, value: Any) -> str:
    if feature in {"crime_rate", "incident_count", "real_incident_count", "women_incident_count", "high_severity_count"}:
        try:
            return str(int(round(float(value))))
        except Exception:
            return str(value)
    if feature in {"cctv_coverage", "street_light_coverage", "women_safety_risk", "ncrb_crime_intensity"}:
        try:
            return f"{float(value):.0f}%"
        except Exception:
            return str(value).title()
    if feature == "police_distance_km":
        try:
            return f"{float(value):.1f} km"
        except Exception:
            return str(value)
    return str(value)


def _safe_float(val: Any, default: float = 0.0) -> float:
    try:
        return float(val)
    except Exception:
        sval = str(val).strip().lower()
        if sval in ["high", "good", "yes", "true"]: return 80.0
        if sval in ["medium", "average"]: return 50.0
        if sval in ["low", "poor", "no", "false"]: return 20.0
        return default


def _derive_risk_breakdown(raw_values: Dict[str, Any]) -> Dict[str, int]:
    crime_component = min(
        100.0,
        (
            _safe_float(raw_values.get("crime_rate", 0)) * 0.4
            + _safe_float(raw_values.get("incident_count", 0)) * 1.1
            + _safe_float(raw_values.get("women_incident_count", 0)) * 1.2
            + _safe_float(raw_values.get("high_severity_count", 0)) * 1.8
        ),
    )
    lighting_component = max(
        0.0,
        min(
            100.0,
            _safe_float(raw_values.get("street_light_coverage", 0)) * 0.7
            + (15.0 if str(raw_values.get("lighting_quality", "")).strip().lower() in {"good", "bright"} else 0.0),
        ),
    )
    women_component = max(
        0.0,
        min(
            100.0,
            100.0
            - (
                _safe_float(raw_values.get("women_safety_risk", 0)) * 0.6
                + _safe_float(raw_values.get("women_incident_count", 0)) * 1.4
            ),
        ),
    )
    cctv_component = max(0.0, min(100.0, _safe_float(raw_values.get("cctv_coverage", 0))))
    police_component = max(
        0.0,
        min(
            100.0,
            100.0
            - (
                _safe_float(raw_values.get("police_distance_km", 0)) * 12.0
                + (0.0 if _safe_float(raw_values.get("police_station_nearby", 0)) >= 1.0 else 18.0)
            ),
        ),
    )

    return {
        "crime_risk": int(round(max(0.0, 100.0 - crime_component))),
        "lighting_quality": int(round(lighting_component)),
        "women_safety": int(round(women_component)),
        "cctv_coverage": int(round(cctv_component)),
        "police_accessibility": int(round(police_component)),
    }


def _summarize_prediction(safety_score: float, positive_factors: List[Dict[str, Any]], negative_factors: List[Dict[str, Any]]) -> str:
    pos_labels = [item["label"] for item in positive_factors[:3]]
    neg_labels = [item["label"] for item in negative_factors[:3]]

    if safety_score >= 75:
        return f"This route is safe because of {', '.join(pos_labels) if pos_labels else 'overall good conditions'}."
    elif safety_score >= 50:
        return f"This route is acceptable, but be aware of {', '.join(neg_labels) if neg_labels else 'moderate risks'}."
    else:
        return f"This route is risky because of {', '.join(neg_labels) if neg_labels else 'multiple danger factors'}."


# =========================================================
# Model loading API (cached)
# =========================================================

def load_models() -> Tuple[RandomForestRegressor, RandomForestClassifier, Dict[str, LabelEncoder]]:
    """Load and cache models and encoders from disk.

    Returns (regressor, classifier, label_encoders)
    Raises FileNotFoundError or other exceptions on failure.
    """
    global _MODEL_CACHE
    if _MODEL_CACHE.get("loaded"):
        return _MODEL_CACHE["reg"], _MODEL_CACHE["clf"], _MODEL_CACHE["enc"]

    os.makedirs(MODELS_DIR, exist_ok=True)

    if not os.path.isfile(REG_PATH) or not os.path.isfile(CLF_PATH) or not os.path.isfile(ENC_PATH):
        raise FileNotFoundError("One or more model files are missing in 'backend/models/'.")

    try:
        reg = joblib.load(REG_PATH)
        clf = joblib.load(CLF_PATH)
        enc = joblib.load(ENC_PATH)

        _MODEL_CACHE["reg"] = reg
        _MODEL_CACHE["clf"] = clf
        _MODEL_CACHE["enc"] = enc
        _MODEL_CACHE["loaded"] = True

        print("Models loaded successfully!")
        return reg, clf, enc
    except Exception as e:
        # do not crash importers; re-raise for callers to handle
        raise RuntimeError(f"Failed to load models: {e}")


# =========================================================
# Prediction API (safe to import)
# =========================================================

def predict_safety(**kwargs) -> Dict[str, Any]:
    """Predict safety metrics for a single input dict.

    Accepts keyword arguments matching FEATURE_COLUMNS.
    Returns: {safety_score, safety_label, confidence, top_risk_factors, feature_importance, positive_factors, negative_factors, ai_summary}
    """
    # ensure models are loaded (cached)
    reg, clf, encoders = load_models()

    # Prepare row in feature order
    row = {}
    raw_values = {}
    for col in FEATURE_COLUMNS:
        if col not in kwargs:
            raise ValueError(f"Missing required feature: {col}")
        v = kwargs[col]

        semantic_v = v
        if encoders and col in encoders:
            try:
                if isinstance(v, (int, float)) or (isinstance(v, str) and v.replace(".", "", 1).isdigit()):
                    semantic_v = encoders[col].inverse_transform([int(float(v))])[0]
            except Exception:
                pass

        raw_values[col] = semantic_v

        if encoders and col in encoders:
            row[col] = _safe_label_transform(encoders[col], v)
        else:
            row[col] = v

    row_df = pd.DataFrame([row], columns=FEATURE_COLUMNS)

    # Ensure numeric types for numeric columns
    for col in FEATURE_COLUMNS:
        if pd.api.types.is_numeric_dtype(row_df[col]):
            row_df[col] = pd.to_numeric(row_df[col], errors="coerce").fillna(0)

    # Predict
    safety_score = float(reg.predict(row_df)[0])

    clf_pred = clf.predict(row_df)[0]
    safety_label = None
    if encoders and "safety_label" in encoders:
        try:
            safety_label = encoders["safety_label"].inverse_transform([clf_pred])[0]
        except Exception:
            safety_label = str(clf_pred)
    else:
        safety_label = str(clf_pred)

    confidence = 0.0
    try:
        proba = clf.predict_proba(row_df)[0]
        confidence = float(max(proba))
    except Exception:
        confidence = 0.0

    # Compute explainability signals using combined importances and raw values
    try:
        imp_reg = getattr(reg, "feature_importances_", np.zeros(len(FEATURE_COLUMNS)))
        imp_clf = getattr(clf, "feature_importances_", np.zeros(len(FEATURE_COLUMNS)))
        combined = (np.array(imp_reg) + np.array(imp_clf)) / 2.0

        features: List[Dict[str, Any]] = []
        for i, feat in enumerate(FEATURE_COLUMNS):
            raw_value = raw_values[feat]
            direction, magnitude, explanation = _feature_direction_score(feat, raw_value)
            importance = float(combined[i])
            contribution = importance * magnitude
            if direction == "negative":
                contribution *= -1.0

            features.append(
                {
                    "feature": feat,
                    "label": _human_label(feat, direction),
                    "value": _feature_display_value(feat, raw_value),
                    "importance": round(importance, 4),
                    "direction": direction,
                    "contribution": round(contribution, 4),
                    "reason": explanation,
                }
            )

        features_sorted = sorted(features, key=lambda item: abs(item["contribution"]), reverse=True)
        positive_factors = [item for item in features_sorted if item["direction"] == "positive"][:3]
        negative_factors = [item for item in features_sorted if item["direction"] == "negative"][:3]
        top_risk_factors = [item["label"] for item in negative_factors[:3]] or [item["label"] for item in features_sorted[:3]]
        dominant_risk = negative_factors[0]["label"] if negative_factors else (features_sorted[0]["label"] if features_sorted else "Mixed route signals")
        risk_breakdown = _derive_risk_breakdown(raw_values)
        risk_level = "low" if safety_score >= 75 else "moderate" if safety_score >= 50 else "high"
        safest_route_reason = (
            f"Strongest positives are {', '.join(item['label'] for item in positive_factors[:3])}."
            if positive_factors
            else "Safety is driven by a balanced mix of route signals."
        )
        avoid_route_reason = (
            f"Main risk drivers are {', '.join(item['label'] for item in negative_factors[:3])}."
            if negative_factors
            else "This route does not expose a clear dominant penalty."
        )
        route_recommendation_text = _summarize_prediction(safety_score, positive_factors, negative_factors)
        ai_summary = route_recommendation_text
    except Exception as e:
        import traceback
        traceback.print_exc()
        features_sorted = []
        positive_factors = []
        negative_factors = []
        top_risk_factors = []
        dominant_risk = "Mixed route signals"
        risk_breakdown = {
            "crime_risk": 50,
            "lighting_quality": 50,
            "women_safety": 50,
            "cctv_coverage": 50,
            "police_accessibility": 50,
        }
        risk_level = "moderate"
        safest_route_reason = "The model produced a valid prediction, but explanation details were unavailable."
        avoid_route_reason = "The model produced a valid prediction, but explanation details were unavailable."
        route_recommendation_text = "This route was scored successfully, but the explanation engine could not derive a narrative."
        ai_summary = route_recommendation_text

    return {
        "safety_score": round(safety_score, 2),
        "safety_label": safety_label,
        "confidence": round(confidence, 4),
        "top_risk_factors": top_risk_factors,
        "feature_importance": features_sorted[:8],
        "positive_factors": positive_factors,
        "negative_factors": negative_factors,
        "dominant_risk": dominant_risk,
        "risk_breakdown": risk_breakdown,
        "risk_level": risk_level,
        "safest_route_reason": safest_route_reason,
        "avoid_route_reason": avoid_route_reason,
        "route_recommendation_text": route_recommendation_text,
        "ai_summary": ai_summary,
    }


# =========================================================
# Training pipeline (runs only when executed directly)
# =========================================================

def _synthesize_missing(df: pd.DataFrame) -> pd.DataFrame:
    """Synthesize missing incident-derived columns if required."""
    missing = [c for c in SYNTH_COLS if c not in df.columns]
    if not missing:
        return df

    if "incident_count" not in df.columns:
        raise ValueError("Cannot synthesize incident-derived columns without 'incident_count'.")

    df["incident_count"] = pd.to_numeric(df["incident_count"], errors="coerce").fillna(0)
    REAL = _get_float_env("SYNTH_REAL_FACTOR", 1.0)
    WOMEN = _get_float_env("SYNTH_WOMEN_FACTOR", 0.4)
    HIGH = _get_float_env("SYNTH_HIGH_SEVERITY_FACTOR", 0.2)

    if "real_incident_count" in missing:
        df["real_incident_count"] = (df["incident_count"] * REAL).round().astype(int)
    if "women_incident_count" in missing:
        df["women_incident_count"] = (df["incident_count"] * WOMEN).round().astype(int)
    if "high_severity_count" in missing:
        df["high_severity_count"] = (df["incident_count"] * HIGH).round().astype(int)

    return df


def main():
    """Full training + evaluation pipeline. Runs only when module executed directly."""
    print("Training pipeline started...")

    dataset = resolve_dataset_path()
    print(f"Loading dataset: {dataset}")
    df = pd.read_csv(dataset)

    # synthesize if needed
    df = _synthesize_missing(df)

    # basic cleaning
    df.drop_duplicates(inplace=True)
    df.dropna(inplace=True)

    # encode categorical columns
    label_encoders: Dict[str, LabelEncoder] = {}
    categorical_columns = ["area_type", "time_of_day", "lighting_quality", "crowd_density", "safety_label", "cctv_coverage", "street_light_coverage"]
    for col in categorical_columns:
        if col in df.columns:
            enc = LabelEncoder()
            df[col] = enc.fit_transform(df[col].astype(str))
            label_encoders[col] = enc

    # ensure all feature columns present
    missing = [c for c in FEATURE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError("Missing required feature columns: " + ", ".join(missing))

    # auto-encode remaining non-numeric features
    for col in FEATURE_COLUMNS:
        if not pd.api.types.is_numeric_dtype(df[col]):
            enc = LabelEncoder()
            df[col] = enc.fit_transform(df[col].astype(str))
            label_encoders[col] = enc

    X = df[FEATURE_COLUMNS]
    y_reg = df[TARGET_REGRESSION]
    y_clf = df[TARGET_CLASSIFICATION]

    # train/test split
    X_train, X_test, y_reg_train, y_reg_test, y_clf_train, y_clf_test = train_test_split(
        X, y_reg, y_clf, test_size=0.2, random_state=42
    )

    # train models
    reg = RandomForestRegressor(n_estimators=150, max_depth=12, random_state=42, n_jobs=-1)
    clf = RandomForestClassifier(n_estimators=150, max_depth=12, random_state=42, n_jobs=-1)

    reg.fit(X_train, y_reg_train)
    clf.fit(X_train, y_clf_train)

    # evaluation (brief)
    try:
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score, accuracy_score, classification_report
        y_reg_pred = reg.predict(X_test)
        print("\nRegression evaluation:")
        print(f"MAE: {mean_absolute_error(y_reg_test, y_reg_pred):.2f}")
        print(f"RMSE: {np.sqrt(mean_squared_error(y_reg_test, y_reg_pred)):.2f}")
        print(f"R2: {r2_score(y_reg_test, y_reg_pred):.4f}")

        y_clf_pred = clf.predict(X_test)
        print("\nClassification evaluation:")
        print(f"Accuracy: {accuracy_score(y_clf_test, y_clf_pred)*100:.2f}%")
        print(classification_report(y_clf_test, y_clf_pred))
    except Exception:
        pass

    # Save models and encoders
    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(reg, REG_PATH)
    joblib.dump(clf, CLF_PATH)
    joblib.dump(label_encoders, ENC_PATH)
    print("Models saved successfully!")

    # Print examples using the newly trained models
    examples = [
        # safe
        dict(area_type="residential", time_of_day="day", lighting_quality="good", crime_rate=1, crowd_density=10, incident_count=1, cctv_coverage="high", police_distance_km=0.5, women_safety_risk=1, street_light_coverage="high", police_station_nearby=1, ncrb_crime_intensity=1, real_incident_count=1, women_incident_count=0, high_severity_count=0),
        # medium
        dict(area_type="market", time_of_day="evening", lighting_quality="average", crime_rate=5, crowd_density=50, incident_count=5, cctv_coverage="medium", police_distance_km=2.0, women_safety_risk=3, street_light_coverage="medium", police_station_nearby=0, ncrb_crime_intensity=3, real_incident_count=5, women_incident_count=2, high_severity_count=1),
        # unsafe
        dict(area_type="isolated", time_of_day="night", lighting_quality="poor", crime_rate=9, crowd_density=5, incident_count=10, cctv_coverage="low", police_distance_km=10.0, women_safety_risk=8, street_light_coverage="low", police_station_nearby=0, ncrb_crime_intensity=8, real_incident_count=10, women_incident_count=4, high_severity_count=3),
    ]

    print("\n--- Example predictions ---")
    # use module-level predict_safety which will call load_models and use saved models
    for ex in examples:
        out = predict_safety(**ex)
        print(out)


if __name__ == "__main__":
    main()
