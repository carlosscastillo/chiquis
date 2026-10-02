// ============================================================
//  Perfiles de ejemplo. Copia este archivo como perfiles.js y pon
//  sus nombres, colores y metas. perfiles.js NO se sube a GitHub.
// ============================================================
export const PERFILES = {
  a: {
    name: 'Alex',
    color: '#FF7A3D', soft: '#3A2418',
    goals: { kcal: 2400, protein: 150, water: 3, sleep: 7, steps: 8000 },
    weightRate: [0.3, 0.5],                       // kg por semana que se espera bajar
    incrementos: { superior: 2.5, inferior: 5 },  // kg que se sube al progresar
  },
  b: {
    name: 'Sam',
    color: '#FF5C8A', soft: '#3A1A26',
    goals: { kcal: 1800, protein: 120, water: 2.5, sleep: 7, steps: 9000 },
    weightRate: [0.25, 0.4],
    incrementos: { superior: 1, inferior: 2.5 },
  },
};
