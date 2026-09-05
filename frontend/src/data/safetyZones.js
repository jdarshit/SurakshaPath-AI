/**
 * Mock Safety Zones Data for Indore City
 * Real data would come from backend API or crime databases
 */

export const INDORE_SAFETY_ZONES = [
  {
    id: 'zone-1',
    area_name: 'Vijay Nagar',
    lat: 22.7533,
    lng: 75.8937,
    safety_score: 82,
    radius: 800,
  },
  {
    id: 'zone-2',
    area_name: 'Rajwada',
    lat: 22.7177,
    lng: 75.8545,
    safety_score: 58,
    radius: 600,
  },
  {
    id: 'zone-3',
    area_name: 'Loha Mandi',
    lat: 22.7010,
    lng: 75.8400,
    safety_score: 21,
    radius: 700,
  },
  {
    id: 'zone-4',
    area_name: 'MG Road',
    lat: 22.7250,
    lng: 75.8600,
    safety_score: 75,
    radius: 900,
  },
  {
    id: 'zone-5',
    area_name: 'Khajrana',
    lat: 22.7050,
    lng: 75.8800,
    safety_score: 65,
    radius: 750,
  },
  {
    id: 'zone-6',
    area_name: 'Choti Gwaltoli',
    lat: 22.7400,
    lng: 75.8700,
    safety_score: 48,
    radius: 650,
  },
  {
    id: 'zone-7',
    area_name: 'Sudama Nagar',
    lat: 22.7600,
    lng: 75.8300,
    safety_score: 76,
    radius: 800,
  },
  {
    id: 'zone-8',
    area_name: 'New Palasia',
    lat: 22.7300,
    lng: 75.8500,
    safety_score: 71,
    radius: 700,
  },
  {
    id: 'zone-9',
    area_name: 'Ab Road',
    lat: 22.7450,
    lng: 75.8650,
    safety_score: 35,
    radius: 550,
  },
  {
    id: 'zone-10',
    area_name: 'Rau',
    lat: 22.6900,
    lng: 75.8100,
    safety_score: 42,
    radius: 900,
  },
  {
    id: 'zone-11',
    area_name: 'Bhamashah Nagar',
    lat: 22.7550,
    lng: 75.8450,
    safety_score: 79,
    radius: 650,
  },
  {
    id: 'zone-12',
    area_name: 'GEB Colony',
    lat: 22.7100,
    lng: 75.8750,
    safety_score: 54,
    radius: 700,
  },
];

/**
 * Get safety category for a score
 */
export function getSafetyCategory(score) {
  if (score >= 70) return 'safe';
  if (score >= 40) return 'medium';
  return 'unsafe';
}

/**
 * Get color for safety category
 */
export const SAFETY_COLORS = {
  safe: '#10b981', // emerald-500
  medium: '#f59e0b', // amber-500
  unsafe: '#ef4444', // red-500
};

/**
 * Get label for safety category
 */
export const SAFETY_LABELS = {
  safe: 'Safe',
  medium: 'Medium',
  unsafe: 'Unsafe',
};
