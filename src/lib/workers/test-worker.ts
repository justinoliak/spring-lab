// Simple test worker to verify worker communication
declare const self: DedicatedWorkerGlobalScope;

console.log('Test worker loaded');

self.onmessage = function(event) {
	console.log('Test worker received:', event.data);
	
	// Simple echo back with test data
	postMessage({
		type: 'test_response',
		original: event.data,
		timestamp: Date.now(),
		message: 'Worker communication works!'
	});
};

self.onerror = function(error) {
	console.error('Test worker error:', error);
};