<script lang="ts">
	// Canvas component for spring visualization
	import { onMount } from 'svelte';
	import { simulationStore } from '$lib/stores/simulation';
	
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D;
	let animationId: number;

	onMount(() => {
		ctx = canvas.getContext('2d')!;
		canvas.width = 600;
		canvas.height = 400;
		
		// Start animation loop
		animate();
		
		// Handle mouse interactions for dragging mass
		canvas.addEventListener('mousedown', handleMouseDown);
		canvas.addEventListener('mousemove', handleMouseMove);
		canvas.addEventListener('mouseup', handleMouseUp);
		
		return () => {
			if (animationId) cancelAnimationFrame(animationId);
		};
	});

	let isDragging = false;
	let dragOffset = { x: 0, y: 0 };

	function handleMouseDown(event: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		
		// Check if clicking on mass (simplified check)
		// TODO: Implement proper hit detection
		isDragging = true;
		dragOffset = { x, y };
	}

	function handleMouseMove(event: MouseEvent) {
		if (!isDragging) return;
		
		const rect = canvas.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		
		// TODO: Update simulation position based on drag
		// simulationStore.setPosition(x, y);
	}

	function handleMouseUp() {
		isDragging = false;
		// TODO: Resume simulation
	}

	function animate() {
		clear();
		drawSpring();
		drawMass();
		animationId = requestAnimationFrame(animate);
	}

	function clear() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
	}

	function drawSpring() {
		// Draw spring coils
		ctx.strokeStyle = '#6c757d';
		ctx.lineWidth = 2;
		ctx.beginPath();
		
		// Simplified spring drawing
		const springTop = 50;
		const springBottom = 200; // TODO: Get from simulation state
		const centerX = canvas.width / 2;
		
		// Draw spring coils (zigzag pattern)
		const coils = 8;
		const amplitude = 15;
		
		for (let i = 0; i <= coils; i++) {
			const y = springTop + (springBottom - springTop) * (i / coils);
			const x = centerX + (i % 2 === 0 ? -amplitude : amplitude);
			
			if (i === 0) {
				ctx.moveTo(centerX, springTop);
				ctx.lineTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
		
		ctx.lineTo(centerX, springBottom);
		ctx.stroke();
		
		// Draw ceiling attachment
		ctx.strokeStyle = '#343a40';
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(centerX - 30, springTop);
		ctx.lineTo(centerX + 30, springTop);
		ctx.stroke();
	}

	function drawMass() {
		// Draw mass as circle
		const centerX = canvas.width / 2;
		const massY = 200; // TODO: Get from simulation state
		const radius = 20;
		
		ctx.fillStyle = '#007bff';
		ctx.beginPath();
		ctx.arc(centerX, massY, radius, 0, 2 * Math.PI);
		ctx.fill();
		
		// Draw mass outline
		ctx.strokeStyle = '#0056b3';
		ctx.lineWidth = 2;
		ctx.stroke();
	}
</script>

<div class="canvas-container">
	<canvas bind:this={canvas}></canvas>
	<div class="instructions">
		<p>Drag the mass to set initial position, then release to start oscillation</p>
	</div>
</div>

<style>
	.canvas-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	canvas {
		border: 1px solid #dee2e6;
		border-radius: 4px;
		cursor: grab;
	}

	canvas:active {
		cursor: grabbing;
	}

	.instructions {
		text-align: center;
		color: #6c757d;
		font-size: 0.9rem;
	}
</style>