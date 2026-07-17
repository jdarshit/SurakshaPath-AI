"""
NLP Module for SurakshaPath AI - Lazy Loading Version
Analyzes incident report text and predicts severity using TensorFlow LSTM
Models are trained only on first use, then cached for fast startup
"""

import os
import pandas as pd
import numpy as np
from pathlib import Path
import joblib
from typing import Dict

# Setup paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / 'ml_data'
MODELS_DIR = PROJECT_ROOT / 'backend' / 'models'
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Global variables for lazy loading
_model = None
_tokenizer = None
_initialized = False

def _initialize_model():
    """Lazy-load or train NLP models on first use"""
    global _model, _tokenizer, _initialized
    
    if _initialized:
        return
    
    print("[NLP] Initializing NLP model...")
    
    # Check if cached models exist
    model_path = MODELS_DIR / 'nlp_model.h5'
    tokenizer_path = MODELS_DIR / 'nlp_tokenizer.pkl'
    
    if model_path.exists() and tokenizer_path.exists():
        print("[NLP] [OK] Loading cached models from disk...")
        try:
            from tensorflow.keras.models import load_model
            _model = load_model(str(model_path))
            _tokenizer = joblib.load(str(tokenizer_path))
            _initialized = True
            print("[NLP] [OK] Models loaded successfully (cached)")
            return
        except Exception as e:
            print(f"[NLP] [WARN] Failed to load cached models: {e}")
            print("[NLP] [WARN] Will retrain from scratch...")
    
    # If cached models don't exist, train from scratch
    print("[NLP] [WARN] No cached models found, training from scratch...")
    _train_nlp_model()
    _initialized = True

def _train_nlp_model():
    """Train NLP model from scratch"""
    global _model, _tokenizer
    
    from tensorflow.keras.preprocessing.text import Tokenizer
    from tensorflow.keras.preprocessing.sequence import pad_sequences
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Embedding, LSTM, Dense, Dropout, Bidirectional
    from tensorflow.keras.callbacks import EarlyStopping
    from sklearn.model_selection import train_test_split
    
    print("="*70)
    print("STEP 1: LOADING DATA")
    print("="*70)

    data_path = DATA_DIR / 'incident_nlp_data.csv'
    df = pd.read_csv(data_path)
    print(f"[OK] Data loaded: {df.shape}")

    print("\n" + "="*70)
    print("STEP 2: PREPROCESSING TEXT")
    print("="*70)

    MAX_WORDS = 5000
    MAX_LEN = 50

    _tokenizer = Tokenizer(num_words=MAX_WORDS, oov_token='<OOV>')
    _tokenizer.fit_on_texts(df['text'])

    sequences = _tokenizer.texts_to_sequences(df['text'])
    X = pad_sequences(sequences, maxlen=MAX_LEN, padding='post')
    y = df['severity_label'].values

    print(f"[OK] Tokenizer fitted")
    print(f"[OK] Padded sequences shape: {X.shape}")
    print(f"[OK] Labels shape: {y.shape}")

    print("\n" + "="*70)
    print("STEP 3: SPLITTING DATA")
    print("="*70)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"[OK] Training set: {X_train.shape}")
    print(f"[OK] Test set: {X_test.shape}")

    print("\n" + "="*70)
    print("STEP 4: BUILDING LSTM MODEL")
    print("="*70)

    _model = Sequential([
        Embedding(input_dim=MAX_WORDS, output_dim=64, input_length=MAX_LEN),
        Bidirectional(LSTM(64, return_sequences=True)),
        Dropout(0.3),
        Bidirectional(LSTM(32)),
        Dropout(0.3),
        Dense(32, activation='relu'),
        Dense(3, activation='softmax')
    ])

    _model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )

    print("[OK] Model architecture built")

    print("\n" + "="*70)
    print("STEP 5: TRAINING MODEL")
    print("="*70)

    early_stop = EarlyStopping(
        monitor='val_loss',
        patience=3,
        restore_best_weights=True,
        verbose=1
    )

    print("Starting training with EarlyStopping (patience=3)...\n")

    _model.fit(
        X_train, y_train,
        epochs=20,
        batch_size=32,
        validation_split=0.2,
        callbacks=[early_stop],
        verbose=1
    )

    print("[OK] Training completed")

    print("\n" + "="*70)
    print("STEP 6: EVALUATING MODEL")
    print("="*70)

    loss, accuracy = _model.evaluate(X_test, y_test, verbose=0)
    print(f"[OK] Test Loss: {loss:.4f}")
    print(f"[OK] Test Accuracy: {accuracy*100:.2f}%")

    print("\n" + "="*70)
    print("STEP 7: SAVING MODELS")
    print("="*70)

    _model.save(str(MODELS_DIR / 'nlp_model.h5'))
    joblib.dump(_tokenizer, str(MODELS_DIR / 'nlp_tokenizer.pkl'))

    print(f"[OK] Model saved to: {MODELS_DIR / 'nlp_model.h5'}")
    print(f"[OK] Tokenizer saved to: {MODELS_DIR / 'nlp_tokenizer.pkl'}")
    print("\n[OK] NLP MODEL TRAINING COMPLETE!")

def predict_incident_severity(text: str) -> Dict:
    """
    Predict incident severity from text
    Lazy-loads models on first call
    """
    
    # Lazy-load models on first use
    _initialize_model()
    
    from tensorflow.keras.preprocessing.sequence import pad_sequences
    
    MAX_LEN = 50
    
    # Preprocess
    text_clean = text.lower()
    seq = _tokenizer.texts_to_sequences([text_clean])
    padded = pad_sequences(seq, maxlen=MAX_LEN, padding='post')
    
    # Predict
    prediction = _model.predict(padded, verbose=0)[0]
    class_idx = np.argmax(prediction)
    confidence = float(prediction[class_idx])
    
    labels = {0: 'LOW', 1: 'MEDIUM', 2: 'HIGH'}
    scores = {0: 20, 1: 55, 2: 88}
    
    # Keywords detection
    danger_words = [
        'follow', 'knife', 'roka', 'cheen',
        'raat', 'suspicious', 'haath',
        'assault', 'harassment', 'andhera',
        'akele', 'darr', 'danger', 'attack',
        'weapon', 'threat', 'help', 'emergency',
        'unsafe', 'alone', 'dark'
    ]
    
    detected = [w for w in danger_words if w in text.lower()]
    
    return {
        "severity_label": labels[class_idx],
        "severity_score": scores[class_idx],
        "confidence": round(confidence, 3),
        "keywords_detected": detected
    }

print("[NLP] Module loaded. Models will be initialized on first prediction.")
