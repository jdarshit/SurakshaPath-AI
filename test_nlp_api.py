import requests
import json

test_cases = [
    ("Man following me with knife near Rajwada at night", "HIGH"),
    ("Street lights are broken near Loha Mandi", "LOW"),
    ("Area is dark and crowded, feeling unsafe", "MEDIUM")
]

print("\n" + "="*80)
print("NLP SEVERITY PREDICTION API TESTS")
print("="*80)

for text, expected_label in test_cases:
    payload = {
        'text': text,
        'lat': 22.7196,
        'lng': 75.8577,
        'area_name': 'Rajwada'
    }
    
    response = requests.post('http://localhost:8000/incidents/analyze', json=payload)
    data = response.json()
    
    match = "✓" if data['severity_label'] == expected_label else "✗"
    print(f"{match} Expected: {expected_label:8} | Got: {data['severity_label']:8} | Score: {data['severity_score']:3} | Confidence: {data['confidence']:.3f}")

print("="*80 + "\n")
