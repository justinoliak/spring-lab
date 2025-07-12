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
		
		// Fetch the physics module from public directory
		const response = await fetch('/physics.py');
		if (!response.ok) {
			throw new Error(`Failed to fetch physics.py: ${response.status} ${response.statusText}`);
		}
		const physicsCode = await response.text();
		
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