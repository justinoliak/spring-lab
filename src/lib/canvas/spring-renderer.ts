// Canvas rendering utilities for spring visualization
// Handles drawing spring, mass, and physics vectors

export interface SpringRenderState {
	// Mass position
	massX: number;
	massY: number;
	
	// Spring geometry
	springTop: number;
	springLength: number;
	naturalLength: number;
	
	// Visual options
	showForceVectors: boolean;
	showTrail: boolean;
	
	// Forces (for vector display)
	springForce?: { x: number; y: number };
	dampingForce?: { x: number; y: number };
	gravityForce?: { x: number; y: number };
}

export class SpringRenderer {
	private ctx: CanvasRenderingContext2D;
	private width: number;
	private height: number;
	private trail: Array<{ x: number; y: number }> = [];
	private maxTrailLength = 200;
	
	constructor(canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Could not get canvas context');
		
		this.ctx = ctx;
		this.width = canvas.width;
		this.height = canvas.height;
	}
	
	render(state: SpringRenderState) {
		this.clear();
		
		if (state.showTrail) {
			this.drawTrail(state);
		}
		
		this.drawSpring(state);
		this.drawMass(state);
		this.drawCeiling();
		
		if (state.showForceVectors) {
			this.drawForceVectors(state);
		}
	}
	
	private clear() {
		this.ctx.clearRect(0, 0, this.width, this.height);
	}
	
	private drawCeiling() {
		const centerX = this.width / 2;
		const ceilingY = 30;
		
		// Draw ceiling line
		this.ctx.strokeStyle = '#343a40';
		this.ctx.lineWidth = 6;
		this.ctx.lineCap = 'round';
		
		this.ctx.beginPath();
		this.ctx.moveTo(centerX - 40, ceilingY);
		this.ctx.lineTo(centerX + 40, ceilingY);
		this.ctx.stroke();
		
		// Draw ceiling pattern
		this.ctx.strokeStyle = '#6c757d';
		this.ctx.lineWidth = 2;
		
		for (let i = -3; i <= 3; i++) {
			this.ctx.beginPath();
			this.ctx.moveTo(centerX + i * 12, ceilingY - 10);
			this.ctx.lineTo(centerX + i * 12 + 8, ceilingY);
			this.ctx.stroke();
		}
	}
	
	private drawSpring(state: SpringRenderState) {
		const centerX = this.width / 2;
		const springTop = state.springTop;
		const springBottom = state.massY - 20; // Connect just above mass
		
		// Spring coil parameters
		const coils = Math.max(6, Math.floor(state.springLength / 15));
		const amplitude = 12;
		
		// Color based on compression/extension
		const compression = (state.springLength - state.naturalLength) / state.naturalLength;
		if (compression > 0) {
			this.ctx.strokeStyle = '#dc3545'; // Red for extension
		} else if (compression < -0.1) {
			this.ctx.strokeStyle = '#ffc107'; // Yellow for compression
		} else {
			this.ctx.strokeStyle = '#28a745'; // Green for near equilibrium
		}
		
		this.ctx.lineWidth = 3;
		this.ctx.lineCap = 'round';
		this.ctx.lineJoin = 'round';
		
		this.ctx.beginPath();
		this.ctx.moveTo(centerX, springTop);
		
		// Draw coils
		for (let i = 1; i <= coils; i++) {
			const progress = i / (coils + 1);
			const y = springTop + (springBottom - springTop) * progress;
			const x = centerX + (i % 2 === 1 ? amplitude : -amplitude);
			this.ctx.lineTo(x, y);
		}
		
		this.ctx.lineTo(centerX, springBottom);
		this.ctx.stroke();
	}
	
	private drawMass(state: SpringRenderState) {
		const radius = 18;
		
		// Mass shadow
		this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
		this.ctx.beginPath();
		this.ctx.arc(state.massX + 3, state.massY + 3, radius, 0, 2 * Math.PI);
		this.ctx.fill();
		
		// Mass body
		this.ctx.fillStyle = '#007bff';
		this.ctx.beginPath();
		this.ctx.arc(state.massX, state.massY, radius, 0, 2 * Math.PI);
		this.ctx.fill();
		
		// Mass outline
		this.ctx.strokeStyle = '#0056b3';
		this.ctx.lineWidth = 2;
		this.ctx.stroke();
		
		// Mass highlight
		this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
		this.ctx.beginPath();
		this.ctx.arc(state.massX - 6, state.massY - 6, 6, 0, 2 * Math.PI);
		this.ctx.fill();
	}
	
	private drawTrail(state: SpringRenderState) {
		// Add current position to trail
		this.trail.push({ x: state.massX, y: state.massY });
		
		// Limit trail length
		if (this.trail.length > this.maxTrailLength) {
			this.trail.shift();
		}
		
		if (this.trail.length < 2) return;
		
		// Draw trail with fading opacity
		this.ctx.strokeStyle = '#007bff';
		this.ctx.lineWidth = 1;
		this.ctx.lineCap = 'round';
		
		for (let i = 1; i < this.trail.length; i++) {
			const alpha = i / this.trail.length;
			this.ctx.globalAlpha = alpha * 0.5;
			
			this.ctx.beginPath();
			this.ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
			this.ctx.lineTo(this.trail[i].x, this.trail[i].y);
			this.ctx.stroke();
		}
		
		this.ctx.globalAlpha = 1; // Reset alpha
	}
	
	private drawForceVectors(state: SpringRenderState) {
		if (!state.springForce) return;
		
		const scale = 20; // Pixels per unit force
		const startX = state.massX;
		const startY = state.massY;
		
		// Spring force (red)
		if (state.springForce) {
			this.drawVector(
				startX, startY,
				state.springForce.x * scale,
				state.springForce.y * scale,
				'#dc3545',
				'Spring'
			);
		}
		
		// Damping force (blue)  
		if (state.dampingForce) {
			this.drawVector(
				startX, startY,
				state.dampingForce.x * scale,
				state.dampingForce.y * scale,
				'#0056b3',
				'Damping'
			);
		}
		
		// Gravity force (green)
		if (state.gravityForce) {
			this.drawVector(
				startX, startY,
				state.gravityForce.x * scale,
				state.gravityForce.y * scale,
				'#28a745',
				'Gravity'
			);
		}
	}
	
	private drawVector(x: number, y: number, dx: number, dy: number, color: string, label: string) {
		if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return; // Skip tiny vectors
		
		this.ctx.strokeStyle = color;
		this.ctx.lineWidth = 2;
		this.ctx.lineCap = 'round';
		
		// Vector line
		this.ctx.beginPath();
		this.ctx.moveTo(x, y);
		this.ctx.lineTo(x + dx, y + dy);
		this.ctx.stroke();
		
		// Arrowhead
		const angle = Math.atan2(dy, dx);
		const arrowLength = 8;
		
		this.ctx.beginPath();
		this.ctx.moveTo(x + dx, y + dy);
		this.ctx.lineTo(
			x + dx - arrowLength * Math.cos(angle - Math.PI / 6),
			y + dy - arrowLength * Math.sin(angle - Math.PI / 6)
		);
		this.ctx.moveTo(x + dx, y + dy);
		this.ctx.lineTo(
			x + dx - arrowLength * Math.cos(angle + Math.PI / 6),
			y + dy - arrowLength * Math.sin(angle + Math.PI / 6)
		);
		this.ctx.stroke();
		
		// Label
		this.ctx.fillStyle = color;
		this.ctx.font = '12px sans-serif';
		this.ctx.fillText(label, x + dx + 5, y + dy - 5);
	}
	
	clearTrail() {
		this.trail = [];
	}
}