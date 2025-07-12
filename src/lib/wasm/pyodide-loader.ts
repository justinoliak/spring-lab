// Pyodide loader utility
// Handles loading and initializing Pyodide with proper error handling

export interface PyodideInstance {
	runPython: (code: string) => any;
	loadPackagesFromImports: (code: string) => Promise<void>;
	registerJsModule: (name: string, module: any) => void;
}

let pyodideInstance: PyodideInstance | null = null;
let loadingPromise: Promise<PyodideInstance> | null = null;

export async function loadPyodide(): Promise<PyodideInstance> {
	// Return existing instance if available
	if (pyodideInstance) {
		return pyodideInstance;
	}
	
	// Return existing loading promise if in progress
	if (loadingPromise) {
		return loadingPromise;
	}
	
	loadingPromise = initializePyodide();
	return loadingPromise;
}

async function initializePyodide(): Promise<PyodideInstance> {
	try {
		console.log('Loading Pyodide...');
		
		// Import Pyodide dynamically
		const pyodideModule = await import('pyodide');
		
		// Initialize Pyodide
		const pyodide = await pyodideModule.loadPyodide({
			indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/',
			stdout: (text: string) => console.log('Pyodide stdout:', text),
			stderr: (text: string) => console.error('Pyodide stderr:', text)
		});
		
		console.log('Pyodide loaded successfully');
		
		// Cache instance
		pyodideInstance = pyodide;
		loadingPromise = null;
		
		return pyodide;
		
	} catch (error) {
		console.error('Failed to load Pyodide:', error);
		loadingPromise = null;
		throw new Error(`Pyodide initialization failed: ${error}`);
	}
}

export function isPyodideReady(): boolean {
	return pyodideInstance !== null;
}

export function getPyodideInstance(): PyodideInstance | null {
	return pyodideInstance;
}