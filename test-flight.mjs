import { simulateDiscFlight } from './src/utils/flightPhysics.js';
const disc = { name: 'Destroyer', speed: 12, glide: 5, turn: -1, fade: 3 };
const throwParams = { power: 100, aimAngle: 0, releaseAngle: 0, noseAngle: 0 };
const result = simulateDiscFlight(disc, throwParams, { speed: 0, direction: 0 }, (x, z) => 0);
console.log('Result summary:', { maxHeight: result.maxHeight, totalDistance: result.totalDistance, landingIndex: result.landingIndex });
