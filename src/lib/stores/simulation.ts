// Simulation state management store
import { writable } from 'svelte/store';

interface SimulationState {
	// Physics state
	position: { x: number; y: number };
	velocity: { x: number; y: number };
	time: number;
	
	// Initial conditions (tracked for analytical calculations)
	initialPosition: { x: number; y: number };
	initialVelocity: { x: number; y: number };
	
	// Parameters
	params: {
		m: number;  // mass
		k: number;  // spring constant
		c: number;  // damping
		mode: '1D' | 'VECTOR';
	};
	
	// Analytical solution
	analytical: {
		case: 'underdamped' | 'critical' | 'overdamped';
		omega_n: number;
		zeta: number;
		A: number;
		B: number;
		omega_d?: number;
		r1?: number;
		r2?: number;
	} | null;
	
	// Status
	isRunning: boolean;
	worker: Worker | null;
}

const initialState: SimulationState = {
	position: { x: 1.2, y: 0 },  // Start well above equilibrium for visible oscillation
	velocity: { x: 0, y: 0 },
	time: 0,
	initialPosition: { x: 1.2, y: 0 },  // Track initial conditions for analytical calculations
	initialVelocity: { x: 0, y: 0 },
	params: {
		m: 1.0,
		k: 10.0,  // Less stiff spring
		c: 0.5,   // Light damping
		mode: '1D'
	},
	analytical: null,
	isRunning: false,
	worker: null
};

function createSimulationStore() {
	const { subscribe, set, update } = writable<SimulationState>(initialState);
	
	return {
		subscribe,
		
		// Initialize web worker
		async init() {
			if (typeof window === 'undefined') return; // SSR check
			
			try {
				// Create Pyodide worker
				const worker = new Worker(
					new URL('../workers/simulation-worker.ts', import.meta.url),
					{ type: 'module' }
				);
				
				let messageCount = 0;
				worker.onmessage = (event) => {
					const data = event.data;
					messageCount++;
					
					// Debug every 120 messages (roughly once per second at 120Hz)
					if (messageCount % 120 === 0) {
						console.log('📨 Worker message', messageCount, data.type, data.position);
					}
					
					// Handle analytical solution updates from position changes
					if (data.type === 'analytical_updated') {
						update(state => ({
							...state,
							position: data.position,
							velocity: data.velocity,
							time: data.time,
							analytical: data.analytical
						}));
					} else {
						update(state => ({
							...state,
							position: data.position || state.position,
							velocity: data.velocity || state.velocity,
							time: data.time || state.time,
							analytical: data.analytical || state.analytical
						}));
					}
				};
				
				worker.onerror = (error) => {
					console.error('Worker error:', error);
				};
				
				update(state => ({ ...state, worker }));
			} catch (error) {
				console.error('Failed to initialize simulation worker:', error);
			}
		},
		
		// Start simulation
		start() {
			update(state => {
				console.log('📤 Starting simulation, worker:', !!state.worker);
				if (state.worker) {
					const message = {
						type: 'start',
						params: state.params,
						initial: {
							x: state.initialPosition.x,
							y: state.initialPosition.y,
							vx: state.initialVelocity.x,
							vy: state.initialVelocity.y
						}
					};
					console.log('📤 Sending to worker:', message);
					state.worker.postMessage(message);
				} else {
					console.error('❌ No worker available');
				}
				
				return { ...state, isRunning: true };
			});
		},
		
		// Stop simulation
		stop() {
			update(state => {
				if (state.worker) {
					state.worker.postMessage({ type: 'stop' });
				}
				
				return { ...state, isRunning: false };
			});
		},
		
		// Reset simulation
		reset() {
			update(state => {
				// Set initial position based on mode
				const initialPos = state.params.mode === 'VECTOR' 
					? { x: 0.5, y: 1.5 }  // 2D: slightly right and down
					: { x: 1.2, y: 0 };   // 1D: below equilibrium
				const initialVel = { x: 0, y: 0 };
				
				if (state.worker) {
					// Stop the simulation first
					state.worker.postMessage({ type: 'stop' });
					
					// Then reset
					state.worker.postMessage({
						type: 'reset',
						params: state.params,
						initial: {
							x: initialPos.x,
							y: initialPos.y,
							vx: initialVel.x,
							vy: initialVel.y
						}
					});
				}
				
				return {
					...state,
					position: initialPos,
					velocity: initialVel,
					initialPosition: initialPos,  // Update tracked initial conditions
					initialVelocity: initialVel,
					time: 0,
					isRunning: false  // Make sure it's paused after reset
				};
			});
		},
		
		// Update parameters
		updateParams(newParams: Partial<SimulationState['params']>) {
			update(state => {
				const updatedParams = { ...state.params, ...newParams };
				
				// Set appropriate initial conditions for mode
				let newPosition = state.position;
				let newVelocity = state.velocity;
				if (newParams.mode === 'VECTOR' && state.params.mode !== 'VECTOR') {
					// Switching to 2D mode - start at 20° from vertical
					// At natural length L0=1.0m, 20° from vertical: x = L0*sin(20°), y = L0*cos(20°)
					const L0 = 1.0;
					const angle_deg = 20;
					const angle_rad = angle_deg * Math.PI / 180;
					newPosition = { 
						x: L0 * Math.sin(angle_rad),  // ≈ 0.342m horizontal
						y: L0 * Math.cos(angle_rad)   // ≈ 0.940m vertical
					};
					newVelocity = { x: 0, y: 0 }; // Start from rest at 20° angle
				} else if (newParams.mode === '1D' && state.params.mode !== '1D') {
					// Switching to 1D mode - remove horizontal offset
					newPosition = { x: 1.2, y: 0 };
					newVelocity = { x: 0, y: 0 };
				}
				
				if (state.worker) {
					state.worker.postMessage({
						type: 'update_params',
						params: updatedParams,
						initial: {
							x: newPosition.x,
							y: newPosition.y,
							vx: newVelocity.x,
							vy: newVelocity.y
						}
					});
				}
				
				return { 
					...state, 
					params: updatedParams,
					position: newPosition,
					velocity: newVelocity,
					initialPosition: newPosition,  // Update tracked initial conditions
					initialVelocity: newVelocity
				};
			});
		},
		
		// Set position (for dragging)
		setPosition(x: number, y: number) {
			// Clear chart data when starting to drag
			import('../stores/chartData').then(({ clearData }) => clearData());
			
			update(state => {
				const newPosition = { x, y };
				const newVelocity = { x: 0, y: 0 }; // Reset velocity when dragging
				
				if (state.worker) {
					state.worker.postMessage({
						type: 'set_position',
						position: newPosition,
						initial: {
							x: newPosition.x,
							y: newPosition.y,
							vx: newVelocity.x,
							vy: newVelocity.y
						}
					});
				}
				
				return {
					...state,
					position: newPosition,
					velocity: newVelocity,
					initialPosition: newPosition,  // Update initial conditions when position is set
					initialVelocity: newVelocity,
					time: 0  // Reset time when position is manually set
				};
			});
		}
	};
}

export const simulationStore = createSimulationStore();