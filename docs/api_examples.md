# API Examples

## SurakshaPath AI API Collection

**Project:** SurakshaPath AI  
**Tagline:** Surakshit Raasta, Smart Faisla  
**Hackathon:** BGI Hackathon 2026

---

## 1. `/predict` Request Example

### Endpoint

```http
POST /predict
```

### Request Body

```json
{
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
  "high_severity_count": 11
}
```

### Example Response

```json
{
  "status": "success",
  "prediction": {
    "safety_score": 82.5,
    "safety_label": "Safe",
    "confidence": 0.94,
    "top_risk_factors": ["High crime rate", "Poor lighting"],
    "risk_level": "low",
    "route_recommendation_text": "This route is strongly recommended because of Better lighting, Better CCTV coverage.",
    "ai_summary": "This route is strongly recommended because of Better lighting, Better CCTV coverage. Main caution signals are High crime rate, Poor lighting."
  }
}
```

---

## 2. `/incidents/report` Example

### Endpoint

```http
POST /incidents/report
```

### Request Body

```json
{
  "area_name": "Rajwada",
  "incident_type": "Harassment",
  "description": "Street harassment reported",
  "lat": 22.7177,
  "lng": 75.8545,
  "severity": "high",
  "user_id": 1
}
```

### Example Response

```json
{
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
```

---

## 3. `/admin/dashboard` Response Example

### Endpoint

```http
GET /admin/dashboard
```

### Example Response

```json
{
  "status": "success",
  "total_incidents": 124,
  "high_severity_incidents": 18,
  "active_unsafe_zones": 12,
  "ai_predictions_generated": 156,
  "average_safety_score": 52.3,
  "incidents_by_type": [
    {"type": "Harassment", "count": 42},
    {"type": "Poor Lighting", "count": 28}
  ],
  "incidents_by_severity": [
    {"severity": "high", "count": 18},
    {"severity": "medium", "count": 61}
  ],
  "incidents_by_area": [
    {"area": "Rajwada", "count": 19},
    {"area": "Bhawarkua", "count": 14}
  ]
}
```

---

## 4. WebSocket Connection Example

### Endpoint

```text
ws://localhost:8000/ws/sos
```

### JavaScript Client Example

```javascript
const socket = new WebSocket('ws://localhost:8000/ws/sos');

socket.onopen = () => {
  console.log('Connected to SOS stream');
};

socket.onmessage = (event) => {
  const alert = JSON.parse(event.data);
  console.log('Live SOS alert:', alert);
};

socket.onclose = () => {
  console.log('SOS stream closed');
};
```

### Broadcast Use Case

- SOS alerts are streamed to connected clients in real time.
- Incident updates can be pushed instantly to dashboard and live navigation views.
- The WebSocket layer helps the platform behave like a live city safety system.
