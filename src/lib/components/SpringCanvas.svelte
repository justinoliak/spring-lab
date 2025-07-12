<script lang="ts">
	// Canvas component for spring visualization
	import { onMount } from 'svelte';
	import { simulationStore } from '../stores/simulation';
	
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let animationId: number;

	onMount(() => {
		ctx = canvas.getContext('2d')!;
		canvas.width = 500;
		canvas.height = 450;
		
		// Start animation loop
		animate();
		
		// Handle mouse interactions for dragging mass
		canvas.addEventListener('mousedown', handleMouseDown);
		canvas.addEventListener('mousemove', handleMouseMove);
		canvas.addEventListener('mouseup', handleMouseUp);
		
		// Global mouse events to catch mouse up outside canvas
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', handleMouseUp);
		
		return () => {
			if (animationId) cancelAnimationFrame(animationId);
			// Cleanup global event listeners
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	});

	let isDragging = false;
	let dragOffset = { x: 0, y: 0 };

	function handleMouseDown(event: MouseEvent) {
		console.log('Mouse down detected');
		const rect = canvas.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		
		// Calculate current mass position on screen
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		const springTop = 50;
		let massX, massY;
		
		if (currentMode === 'VECTOR') {
			massX = centerX + (currentPosition.x * 150);
			massY = springTop + (currentPosition.y * 150);
		} else {
			massX = centerX;
			massY = centerY + ((currentPosition.x - 1.0) * 150);
		}
		
		// Check if clicking near the mass (within radius)
		const distance = Math.sqrt((mouseX - massX) ** 2 + (mouseY - massY) ** 2);
		console.log('Click distance from mass:', distance, 'Mass at:', massX, massY);
		if (distance <= 30) { // Slightly larger than mass radius for easier clicking
			console.log('Starting drag');
			isDragging = true;
			dragOffset = { x: mouseX - massX, y: mouseY - massY };
			
			// Stop simulation while dragging
			simulationStore.stop();
		}
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) return;
		
		const rect = canvas.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		
		// Calculate new mass position (accounting for drag offset)
		const massX = mouseX - dragOffset.x;
		const massY = mouseY - dragOffset.y;
		
		// Convert screen coordinates back to physics coordinates
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		const springTop = 50;
		
		let newX, newY;
		if (currentMode === 'VECTOR') {
			// Convert from screen position back to physics coordinates
			newX = (massX - centerX) / 150; // horizontal displacement from center
			newY = (massY - springTop) / 150; // vertical displacement from attachment
			
			// Clamp to reasonable bounds  
			newX = Math.max(-2.0, Math.min(2.0, newX)); // ±2m horizontal
			newY = Math.max(0.1, Math.min(4.0, newY)); // 0.1m to 4m from attachment (no negative y)
		} else {
			// 1D mode - only vertical movement
			newX = 1.0 + (massY - centerY) / 150; // position relative to equilibrium
			newY = 0;
			
			// Clamp to reasonable bounds
			newX = Math.max(0.1, Math.min(3.0, newX)); // 0.1m to 3m
		}
		
		// Update position in simulation
		simulationStore.setPosition(newX, newY);
	}

	function handleMouseUp() {
		console.log('Mouse up, isDragging:', isDragging);
		if (isDragging) {
			console.log('Ending drag, starting simulation');
			isDragging = false;
			// Ensure we start from the current position with clean state
			setTimeout(() => {
				simulationStore.start();
			}, 10);
		}
	}

	let frameCount = 0;
	
	function animate() {
		frameCount++;
		
		
		clear();
		drawSpring();
		drawMass();
		animationId = requestAnimationFrame(animate);
	}

	function clear() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	}

	function drawSpring() {
		const springTop = 50;
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		
		// Calculate mass position based on mode
		let massX, massY;
		if (currentMode === 'VECTOR') {
			massX = centerX + (currentPosition.x * 150);
			massY = springTop + (currentPosition.y * 150);
			
			// Draw simple axes for 2D mode
			ctx.save();
			ctx.strokeStyle = '#ddd';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(centerX - 150, springTop);
			ctx.lineTo(centerX + 150, springTop);
			ctx.moveTo(centerX, springTop);
			ctx.lineTo(centerX, springTop + 300);
			ctx.stroke();
			ctx.restore();
		} else {
			massX = centerX;
			massY = centerY + ((currentPosition.x - 1.0) * 150);
			
		}
		
		// Only recalculate spring every few frames or on significant change
		frameSkip++;
		const positionChanged = Math.abs(currentPosition.x - lastPosition.x) > 0.01 || 
								 Math.abs(currentPosition.y - lastPosition.y) > 0.01;
		const shouldUpdate = !springPath || positionChanged || frameSkip > 3;
		
		if (shouldUpdate) {
			frameSkip = 0;
			lastPosition = { ...currentPosition };
			
			// Recreate spring path with fewer calculations
			springPath = new Path2D();
			
			const springLength = Math.sqrt((massX - centerX) ** 2 + (massY - springTop) ** 2);
			const dx = massX - centerX;
			const dy = massY - springTop;
			
			if (springLength > 30) {
				const coils = 8;
				const coilRadius = 10;
				const segments = coils * 12;
				
				springPath.moveTo(centerX, springTop);
				
				// Draw helical spring
				for (let i = 1; i <= segments; i++) {
					const t = i / segments;
					const angle = t * coils * 2 * Math.PI;
					
					// Position along spring axis
					const axisX = centerX + dx * t;
					const axisY = springTop + dy * t;
					
					// Helical offset
					const offsetX = Math.cos(angle) * coilRadius;
					const offsetY = Math.sin(angle) * coilRadius * 0.3;
					
					springPath.lineTo(axisX + offsetX, axisY + offsetY);
				}
				
				springPath.lineTo(massX, massY);
			} else {
				// Simple line for short springs
				springPath.moveTo(centerX, springTop);
				springPath.lineTo(massX, massY);
			}
		}
		
		// Draw the cached spring path
		ctx.strokeStyle = '#333';
		ctx.lineWidth = 1.5;
		ctx.lineCap = 'round';
		ctx.stroke(springPath);
		
		// Draw ceiling attachment
		ctx.fillStyle = '#333';
		ctx.fillRect(centerX - 40, springTop - 10, 80, 10);
		
		// Add mounting bolts
		ctx.fillStyle = '#666';
		ctx.beginPath();
		ctx.arc(centerX - 20, springTop - 5, 3, 0, 2 * Math.PI);
		ctx.fill();
		ctx.beginPath();
		ctx.arc(centerX + 20, springTop - 5, 3, 0, 2 * Math.PI);
		ctx.fill();
	}

	let currentPosition = { x: 0.2, y: 0 };
	let currentVelocity = { x: 0, y: 0 };
	let currentMode = '1D';
	let lastPosition = { x: 0, y: 0 };
	let springPath: Path2D | null = null;
	let frameSkip = 0;
	
	// Subscribe to simulation data
	simulationStore.subscribe(state => {
		if (state.position) {
			currentPosition = state.position;
		}
		if (state.velocity) {
			currentVelocity = state.velocity;
		}
		if (state.params) {
			currentMode = state.params.mode;
		}
	});
	
	function drawMass() {
		// Calculate mass position based on mode
		const centerX = canvas.width / 2;
		const centerY = canvas.height / 2;
		const springTop = 50;
		let massX, massY;
		
		if (currentMode === 'VECTOR') {
			massX = centerX + (currentPosition.x * 150);
			massY = springTop + (currentPosition.y * 150);
		} else {
			massX = centerX;
			massY = centerY + ((currentPosition.x - 1.0) * 150);
		}
		
		const radius = 20;
		
		// Draw simple mass
		ctx.fillStyle = '#666';
		ctx.beginPath();
		ctx.arc(massX, massY, radius, 0, 2 * Math.PI);
		ctx.fill();
		
		// Draw outline
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 2;
		ctx.stroke();
	}
</script>

<div class="canvas-container">
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.canvas-container {
		display: flex;
		justify-content: center;
		align-items: center;
	}

	canvas {
		border: 1px solid #ddd;
		cursor: grab;
		background: #fff;
	}

	canvas:active {
		cursor: grabbing;
	}

</style>