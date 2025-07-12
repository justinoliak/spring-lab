// Pyodide Web Worker for physics simulation
// Runs the SpringEngine at 120Hz in background thread

declare const self: DedicatedWorkerGlobalScope;

let pyodide: any = null;
let isInitialized = false;
let simulationInterval: number | null = null;

// Initialize Pyodide and load physics engine
async function initializePyodide() {
	if (isInitialized) return;
	
	try {
		console.log('⏳ Loading Pyodide module...');
		// Load Pyodide
		const pyodideModule = await import('pyodide');
		console.log('✅ Pyodide module loaded, initializing...');
		
		pyodide = await pyodideModule.loadPyodide({
			indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'
		});
		console.log('✅ Pyodide initialized');
		
		console.log('⏳ Loading physics module...');
		
		// Embedded physics code (no fetch needed)
		const physicsCode = `# physics.py – simple spring-mass physics engine
# Runs at 120Hz in Pyodide Web Worker

import math
from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class SpringEngine:
    """Simple spring-mass system with RK4 integration."""
    
    # Parameters
    m: float = 1.0          # mass (kg)
    k: float = 10.0         # spring constant (N/m)
    c: float = 0.5          # damping coefficient (N·s/m)
    g: float = 9.81         # gravity (m/s²)
    L0: float = 1.0         # natural spring length (m)
    mode: str = "1D"        # "1D" or "VECTOR"
    
    # State
    x: float = 0.2          # position
    y: float = 0.0          # horizontal (VECTOR mode only)
    vx: float = 0.0         # velocity x
    vy: float = 0.0         # velocity y
    t: float = 0.0          # time
    
    def step(self, dt: float = 1/120) -> Dict[str, Any]:
        """Advance one timestep with RK4 integration."""
        if self.mode == "1D":
            self._step_1d(dt)
        else:  # VECTOR
            self._step_2d(dt)
        
        return {
            "x": self.x, "y": self.y,
            "vx": self.vx, "vy": self.vy,
            "t": self.t
        }
    
    def _step_1d(self, dt: float):
        """1D spring RK4 integration."""
        def force(x, v):
            return (-self.k * (x - self.L0) - self.c * v + self.m * self.g) / self.m
        
        # RK4
        k1_v = force(self.x, self.vx)
        k1_x = self.vx
        
        k2_v = force(self.x + k1_x * dt/2, self.vx + k1_v * dt/2)
        k2_x = self.vx + k1_v * dt/2
        
        k3_v = force(self.x + k2_x * dt/2, self.vx + k2_v * dt/2)
        k3_x = self.vx + k2_v * dt/2
        
        k4_v = force(self.x + k3_x * dt, self.vx + k3_v * dt)
        k4_x = self.vx + k3_v * dt
        
        self.x += dt * (k1_x + 2*k2_x + 2*k3_x + k4_x) / 6
        self.vx += dt * (k1_v + 2*k2_v + 2*k3_v + k4_v) / 6
        self.t += dt
    
    def _step_2d(self, dt: float):
        """2D vector spring with angle constraint."""
        def forces(x, y, vx, vy):
            # Spring force (radial)
            r = math.hypot(x, y)
            if r < 1e-9:
                ux, uy = 0.0, 1.0
            else:
                ux, uy = x/r, y/r
            
            F_spring = -self.k * (r - self.L0)
            # Radial damping only
            v_radial = vx*ux + vy*uy
            F_damp = -self.c * v_radial
            
            # Total forces
            Fx = (F_spring + F_damp) * ux
            Fy = (F_spring + F_damp) * uy + self.m * self.g
            
            return Fx/self.m, Fy/self.m
        
        # RK4
        k1_ax, k1_ay = forces(self.x, self.y, self.vx, self.vy)
        k1_vx, k1_vy = self.vx, self.vy
        
        k2_ax, k2_ay = forces(self.x + k1_vx*dt/2, self.y + k1_vy*dt/2, 
                              self.vx + k1_ax*dt/2, self.vy + k1_ay*dt/2)
        k2_vx, k2_vy = self.vx + k1_ax*dt/2, self.vy + k1_ay*dt/2
        
        k3_ax, k3_ay = forces(self.x + k2_vx*dt/2, self.y + k2_vy*dt/2,
                              self.vx + k2_ax*dt/2, self.vy + k2_ay*dt/2)
        k3_vx, k3_vy = self.vx + k2_ax*dt/2, self.vy + k2_ay*dt/2
        
        k4_ax, k4_ay = forces(self.x + k3_vx*dt, self.y + k3_vy*dt,
                              self.vx + k3_ax*dt, self.vy + k3_ay*dt)
        k4_vx, k4_vy = self.vx + k3_ax*dt, self.vy + k3_ay*dt
        
        # Correct RK4 update formulas
        self.x += dt * (k1_vx + 2*k2_vx + 2*k3_vx + k4_vx) / 6
        self.y += dt * (k1_vy + 2*k2_vy + 2*k3_vy + k4_vy) / 6
        self.vx += dt * (k1_ax + 2*k2_ax + 2*k3_ax + k4_ax) / 6
        self.vy += dt * (k1_ay + 2*k2_ay + 2*k3_ay + k4_ay) / 6
        
        self.t += dt
    
    def get_analytical_solution(self) -> Dict[str, Any]:
        """Get closed-form solution parameters for UI."""
        omega_n = math.sqrt(self.k / self.m)
        zeta = self.c / (2 * math.sqrt(self.k * self.m))
        
        # Initial conditions (displacement from equilibrium)
        if self.mode == "1D":
            # 1D: equilibrium at x = L0 + mg/k (spring stretched by weight)
            x_eq = self.L0 + (self.m * self.g) / self.k
            x0 = self.x - x_eq
            v0 = self.vx
        else:
            # 2D: analytical solution is complex, use approximate linearization
            # For small angles, treat as 1D vertical motion
            r_eq = self.L0 + (self.m * self.g) / self.k  # equilibrium length
            r_current = math.hypot(self.x, self.y)
            x0 = r_current - r_eq
            # Calculate radial velocity component (v⃗ · r̂)
            if r_current > 1e-9:
                v0 = (self.vx * self.x + self.vy * self.y) / r_current
            else:
                v0 = 0.0
        
        if zeta < 1.0:
            # Underdamped
            omega_d = omega_n * math.sqrt(1 - zeta**2)
            A = x0
            B = (v0 + zeta * omega_n * x0) / omega_d
            return {
                "case": "underdamped",
                "omega_n": omega_n,
                "omega_d": omega_d,
                "zeta": zeta,
                "A": A,
                "B": B
            }
        elif abs(zeta - 1.0) < 1e-9:
            # Critical
            A = x0
            B = v0 + omega_n * x0
            return {
                "case": "critical",
                "omega_n": omega_n,
                "zeta": zeta,
                "A": A,
                "B": B
            }
        else:
            # Overdamped
            sqrt_term = math.sqrt(zeta**2 - 1)
            r1 = -omega_n * (zeta - sqrt_term)
            r2 = -omega_n * (zeta + sqrt_term)
            det = r2 - r1
            A = (r2 * x0 - v0) / det
            B = (v0 - r1 * x0) / det
            return {
                "case": "overdamped",
                "omega_n": omega_n,
                "zeta": zeta,
                "r1": r1,
                "r2": r2,
                "A": A,
                "B": B
            }
`;
		
		// Execute the physics code
		pyodide.runPython(physicsCode);
		
		console.log('✅ Physics module loaded');
		
		// Create engine instance
		console.log('⏳ Creating engine instance...');
		pyodide.runPython(`
# Create engine instance directly (no import needed since we defined it above)
engine = SpringEngine()
		`);
		console.log('✅ Engine instance created');
		
		isInitialized = true;
		console.log('✅ Pyodide simulation worker fully initialized');
		
		// Test the engine
		console.log('⏳ Testing engine...');
		const testState = pyodide.runPython('engine.step()').toJs({ dict_converter: Object.fromEntries });
		console.log('✅ Test physics step:', testState);
		
		// Notify main thread that we're ready
		postMessage({
			type: 'ready',
			message: 'Pyodide physics engine ready',
			testResult: testState
		});
		
	} catch (error) {
		console.error('❌ Failed to initialize Pyodide worker:', error);
		console.error('Error details:', {
			message: error.message,
			stack: error.stack,
			type: error.constructor.name
		});
		postMessage({ 
			type: 'error', 
			message: `Failed to initialize physics engine: ${error.message}`,
			errorDetails: {
				message: error.message,
				stack: error.stack,
				type: error.constructor.name
			}
		});
		isInitialized = false;
		pyodide = null;
	}
}

// Queue to hold messages while initializing
let messageQueue: any[] = [];
let isProcessingQueue = false;

// Handle messages from main thread
self.onmessage = async function(event) {
	const { type, ...data } = event.data;
	console.log('Worker received message:', type, data);
	
	// If not initialized, queue the message
	if (!isInitialized) {
		messageQueue.push(event.data);
		if (!isProcessingQueue) {
			isProcessingQueue = true;
			console.log('Initializing Pyodide...');
			await initializePyodide();
			
			// Process queued messages
			while (messageQueue.length > 0) {
				const queuedMessage = messageQueue.shift();
				await processMessage(queuedMessage);
			}
			isProcessingQueue = false;
		}
		return;
	}
	
	// Process message immediately if initialized
	await processMessage(event.data);
};

// Process a single message
async function processMessage(messageData: any) {
	const { type, ...data } = messageData;
	
	if (!pyodide) {
		console.error('❌ Pyodide not ready, isInitialized:', isInitialized);
		postMessage({ type: 'error', message: 'Physics engine not ready' });
		return;
	}
	
	try {
		switch (type) {
			case 'start':
				startSimulation(data.params, data.initial);
				break;
				
			case 'stop':
				stopSimulation();
				break;
				
			case 'reset':
				resetSimulation(data.params, data.initial);
				break;
				
			case 'update_params':
				updateParameters(data.params, data.initial);
				break;
				
			case 'set_position':
				setPosition(data.position);
				break;
				
			default:
				console.warn('Unknown message type:', type);
		}
	} catch (error) {
		console.error('Worker error:', error);
		postMessage({ 
			type: 'error', 
			message: error instanceof Error ? error.message : 'Unknown error' 
		});
	}
}

function startSimulation(params: any, initial: any) {
	if (simulationInterval) {
		clearInterval(simulationInterval);
	}
	
	// Update engine parameters
	pyodide.runPython(`
engine.m = ${params.m}
engine.k = ${params.k}
engine.c = ${params.c}
engine.mode = "${params.mode}"
engine.x = ${initial.x}
engine.y = ${initial.y}
engine.vx = ${initial.vx}
engine.vy = ${initial.vy}
engine.t = 0.0
	`);
	
	// Get initial analytical solution
	const analytical = pyodide.runPython('engine.get_analytical_solution()').toJs({ dict_converter: Object.fromEntries });
	
	postMessage({
		type: 'started',
		analytical
	});
	
	// Start 120Hz simulation loop
	simulationInterval = setInterval(() => {
		step();
	}, 1000 / 120) as unknown as number;
}

function stopSimulation() {
	if (simulationInterval) {
		clearInterval(simulationInterval);
		simulationInterval = null;
	}
	
	postMessage({ type: 'stopped' });
}

function resetSimulation(params: any, initial: any) {
	stopSimulation();
	// Just reset position, don't start - user must drag to start
	updateParameters(params, initial);
}

function updateParameters(params: any, initial?: any) {
	console.log('🔧 Updating parameters:', params);
	
	pyodide.runPython(`
engine.m = ${params.m}
engine.k = ${params.k}  
engine.c = ${params.c}
engine.mode = "${params.mode}"
print(f"Engine mode set to: {engine.mode}")
	`);
	
	// Update initial conditions if provided (for mode switching)
	if (initial) {
		console.log('🔧 Setting initial conditions:', initial);
		pyodide.runPython(`
engine.x = ${initial.x}
engine.y = ${initial.y}
engine.vx = ${initial.vx}
engine.vy = ${initial.vy}
engine.t = 0.0
print(f"Initial position set to: x={engine.x}, y={engine.y}")
		`);
	}
	
	// Send updated analytical solution
	const analytical = pyodide.runPython('engine.get_analytical_solution()').toJs({ dict_converter: Object.fromEntries });
	
	postMessage({
		type: 'params_updated',
		analytical
	});
}

function setPosition(position: any) {
	pyodide.runPython(`
engine.x = ${position.x}
engine.y = ${position.y}
engine.vx = 0.0
engine.vy = 0.0
engine.t = 0.0  # Reset time to 0
	`);
	
	// Recalculate analytical solution from new position
	const analytical = pyodide.runPython('engine.get_analytical_solution()').toJs({ dict_converter: Object.fromEntries });
	
	// Send updated analytical solution to main thread
	postMessage({
		type: 'analytical_updated',
		analytical,
		position: { x: position.x, y: position.y },
		velocity: { x: 0, y: 0 },
		time: 0
	});
}

function step() {
	// Run one physics timestep
	const state = pyodide.runPython('engine.step()').toJs({ dict_converter: Object.fromEntries });
	
	// Debug every 120 steps (once per second)
	const stepCount = Math.floor(state.t * 120);
	if (stepCount % 120 === 0 && stepCount > 0) {
		console.log('🔬 Physics step:', {
			mode: state.mode,
			position: { x: state.x, y: state.y },
			velocity: { x: state.vx, y: state.vy },
			time: state.t
		});
	}
	
	// Send state to main thread
	postMessage({
		type: 'step',
		position: { x: state.x, y: state.y },
		velocity: { x: state.vx, y: state.vy },
		time: state.t
	});
}

// Handle worker errors
self.onerror = function(error) {
	console.error('Worker error:', error);
	postMessage({ 
		type: 'error', 
		message: error.message || 'Unknown worker error' 
	});
};