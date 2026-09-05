"""
CNN Model for Area Safety Image Analysis
Generates synthetic training images and trains a MobileNetV2-based CNN model
for classifying areas as safe, medium, or unsafe based on visual features.
"""

import numpy as np
import os
from PIL import Image, ImageDraw
import random
import sys

def generate_training_images():
    """Generate 300 synthetic training images (100 each for safe/medium/unsafe)"""
    
    categories = {
        'safe': 'ml_data/images/safe',
        'medium': 'ml_data/images/medium', 
        'unsafe': 'ml_data/images/unsafe'
    }
    
    for cat, path in categories.items():
        os.makedirs(path, exist_ok=True)
    
    print("Generating training images...")
    
    # Safe area images (bright, clear)
    print("  Generating SAFE images (100)...")
    for i in range(100):
        img = Image.new('RGB', (224, 224))
        draw = ImageDraw.Draw(img)
        # Bright background
        brightness = random.randint(180, 255)
        draw.rectangle(
            [0, 0, 224, 224], 
            fill=(brightness, brightness, brightness - 20))
        # Street lights (bright circles)
        for _ in range(random.randint(3, 6)):
            x = random.randint(20, 200)
            y = random.randint(20, 100)
            r = random.randint(8, 15)
            draw.ellipse(
                [x - r, y - r, x + r, y + r],
                fill=(255, 255, 200))
        # People (dark rectangles = crowd)
        for _ in range(random.randint(5, 10)):
            x = random.randint(20, 200)
            y = random.randint(100, 200)
            draw.rectangle(
                [x, y, x + 10, y + 25],
                fill=(50, 50, 100))
        img.save(f'ml_data/images/safe/safe_{i}.jpg')
    
    # Medium area images
    print("  Generating MEDIUM images (100)...")
    for i in range(100):
        img = Image.new('RGB', (224, 224))
        draw = ImageDraw.Draw(img)
        brightness = random.randint(100, 179)
        draw.rectangle(
            [0, 0, 224, 224],
            fill=(brightness, brightness, brightness - 30))
        # Fewer lights
        for _ in range(random.randint(1, 3)):
            x = random.randint(20, 200)
            y = random.randint(20, 100)
            r = random.randint(5, 10)
            draw.ellipse(
                [x - r, y - r, x + r, y + r],
                fill=(200, 200, 150))
        # Some people
        for _ in range(random.randint(2, 5)):
            x = random.randint(20, 200)
            y = random.randint(100, 200)
            draw.rectangle(
                [x, y, x + 10, y + 25],
                fill=(60, 60, 80))
        img.save(f'ml_data/images/medium/medium_{i}.jpg')
    
    # Unsafe area images (dark, isolated)
    print("  Generating UNSAFE images (100)...")
    for i in range(100):
        img = Image.new('RGB', (224, 224))
        draw = ImageDraw.Draw(img)
        brightness = random.randint(20, 99)
        draw.rectangle(
            [0, 0, 224, 224],
            fill=(brightness, brightness - 10, brightness - 20))
        # No lights or very dim
        if random.random() > 0.7:
            x = random.randint(20, 200)
            y = random.randint(20, 100)
            draw.ellipse(
                [x - 5, y - 5, x + 5, y + 5],
                fill=(100, 100, 80))
        # No people (isolated)
        if random.random() > 0.8:
            x = random.randint(20, 200)
            y = random.randint(100, 200)
            draw.rectangle(
                [x, y, x + 10, y + 25],
                fill=(40, 40, 50))
        img.save(f'ml_data/images/unsafe/unsafe_{i}.jpg')
    
    print("✓ 300 training images generated!")

# Generate images first
generate_training_images()

# Now train the CNN model
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import (
    Conv2D, MaxPooling2D, Flatten,
    Dense, Dropout, GlobalAveragePooling2D
)
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.callbacks import EarlyStopping
import joblib

IMG_SIZE = 224
BATCH_SIZE = 32

print("\n" + "="*70)
print("BUILDING CNN MODEL")
print("="*70)

# Data generators with augmentation
print("\nPreparing data generators...")
train_datagen = ImageDataGenerator(
    rescale=1./255,
    rotation_range=10,
    width_shift_range=0.1,
    height_shift_range=0.1,
    horizontal_flip=True,
    validation_split=0.2
)

train_gen = train_datagen.flow_from_directory(
    'ml_data/images',
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    subset='training'
)

val_gen = train_datagen.flow_from_directory(
    'ml_data/images',
    target_size=(IMG_SIZE, IMG_SIZE),
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    subset='validation'
)

print(f"Class mapping: {train_gen.class_indices}")

# Use MobileNetV2 as base (Transfer Learning)
print("\nLoading MobileNetV2 base model...")
base_model = MobileNetV2(
    input_shape=(IMG_SIZE, IMG_SIZE, 3),
    include_top=False,
    weights='imagenet'
)
base_model.trainable = False

print("Building CNN architecture...")
model = Sequential([
    base_model,
    GlobalAveragePooling2D(),
    Dense(128, activation='relu'),
    Dropout(0.3),
    Dense(64, activation='relu'),
    Dropout(0.2),
    Dense(3, activation='softmax')
])

model.compile(
    optimizer='adam',
    loss='categorical_crossentropy',
    metrics=['accuracy']
)

print("\nModel architecture:")
model.summary()

# Train
early_stop = EarlyStopping(
    monitor='val_loss',
    patience=3,
    restore_best_weights=True
)

print("\n" + "="*70)
print("TRAINING CNN MODEL")
print("="*70)
history = model.fit(
    train_gen,
    validation_data=val_gen,
    epochs=15,
    callbacks=[early_stop],
    verbose=1
)

# Evaluate
print("\n" + "="*70)
print("EVALUATING MODEL")
print("="*70)
loss, accuracy = model.evaluate(val_gen, verbose=0)
print(f"\nCNN Accuracy: {accuracy*100:.2f}%")
print(f"CNN Loss: {loss:.4f}")

# Save models
print("\n" + "="*70)
print("SAVING MODELS")
print("="*70)
os.makedirs('models', exist_ok=True)
model.save('models/cnn_model.h5')
class_indices = train_gen.class_indices
joblib.dump(class_indices, 'models/cnn_class_indices.pkl')
print("✓ CNN Model saved to: models/cnn_model.h5")
print("✓ Class indices saved to: models/cnn_class_indices.pkl")

# Define prediction function
def predict_area_safety(image_path: str):
    """Predict area safety from image"""
    from PIL import Image as PILImage
    import numpy as np
    
    # Load and preprocess image
    img = PILImage.open(image_path)
    img = img.resize((IMG_SIZE, IMG_SIZE))
    img_array = np.array(img) / 255.0
    img_array = np.expand_dims(img_array, 0)
    
    # Predict
    prediction = model.predict(img_array, verbose=0)[0]
    
    # Get class
    idx_to_class = {v: k for k, v in class_indices.items()}
    class_idx = int(np.argmax(prediction))
    label = idx_to_class[class_idx]
    confidence = float(prediction[class_idx])
    
    scores = {
        'safe': 85,
        'medium': 52,
        'unsafe': 18
    }
    
    # Determine lighting and crowd based on prediction
    if label == 'safe':
        lighting = "Good"
        crowd = "High"
    elif label == 'unsafe':
        lighting = "Poor"
        crowd = "Low"
    else:
        lighting = "Medium"
        crowd = "Medium"
    
    return {
        "safety_label": label.upper(),
        "safety_score": scores.get(label, 50),
        "confidence": round(confidence, 2),
        "lighting_detected": lighting,
        "crowd_detected": crowd
    }

# Test with generated images
print("\n" + "="*70)
print("TEST PREDICTIONS")
print("="*70)
test_images = [
    'ml_data/images/safe/safe_0.jpg',
    'ml_data/images/medium/medium_0.jpg',
    'ml_data/images/unsafe/unsafe_0.jpg'
]

for img_path in test_images:
    result = predict_area_safety(img_path)
    print(f"\nImage: {img_path}")
    print(f"  Safety Label: {result['safety_label']}")
    print(f"  Safety Score: {result['safety_score']}")
    print(f"  Confidence: {result['confidence']}")
    print(f"  Lighting: {result['lighting_detected']}")
    print(f"  Crowd: {result['crowd_detected']}")

print("\n" + "="*70)
print("CNN MODEL TRAINING COMPLETE!")
print("="*70)
