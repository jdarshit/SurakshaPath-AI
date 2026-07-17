# Judge Q&A Preparation

**Project:** SurakshaPath AI  
**Tagline:** Surakshit Raasta, Smart Faisla  
**Hackathon:** BGI Hackathon 2026

## 1. Why Random Forest?

Random Forest is a strong choice because it handles mixed safety signals well, performs reliably on tabular data, and gives stable predictions without requiring a heavy training pipeline. It also fits the goal of explainable route scoring better than many opaque deep learning approaches.

## 2. Why OpenStreetMap?

OpenStreetMap is open, flexible, and ideal for a smart-city prototype. It gives us full control over map presentation and avoids vendor lock-in while still supporting a professional route-planning experience.

## 3. What is the accuracy?

The current model reports **99.65% classification accuracy** on the prepared safety dataset. More importantly, the system also returns explainable safety signals so the score is understandable, not just high-performing.

## 4. Is it scalable?

Yes. The architecture is modular: the frontend, backend, ML engine, and MySQL layer are separated. That means traffic, analytics, and model logic can scale independently without redesigning the whole product.

## 5. Can this work in the real world?

Yes, with production incident feeds, verified civic data, police response integration, and live map updates. The current system is already structured around real-time reporting and route recomputation, which makes it practical for future rollout.

## 6. What about privacy?

We keep the platform focused on route safety and incident intelligence. Sensitive user data should be minimized, access-controlled, and stored only when necessary. The deployment plan also keeps environment secrets outside the codebase.

## 7. What is the cost profile?

The stack is cost-conscious. FastAPI, React, MySQL, and OpenStreetMap are lightweight and deployment-friendly. Random Forest is also efficient compared with larger model families, which helps keep compute costs low.

## 8. What are the future plans?

The next phase can include an IoT panic button, real police API integration, real-time CCTV analytics, and mobile app deployment. That would move the system from a strong hackathon product toward a broader smart-city safety platform.

## 9. Why is the explanation important?

People trust decisions more when they can see why the system made them. The explainable AI layer helps users understand the safety score, identify the dominant risks, and make a more confident travel decision.

## 10. How do you defend the design choice?

We optimized for clarity, trust, and demo impact. The project is built to be understandable in a few minutes while still showing a realistic end-to-end safety workflow.
