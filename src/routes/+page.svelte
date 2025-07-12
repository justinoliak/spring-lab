<script lang="ts">
	// Main page component - Spring Physics Sandbox
	import { onMount } from 'svelte';
	import SpringCanvas from '../lib/components/SpringCanvas.svelte';
	import PlotlyChart from '../lib/components/PlotlyChart.svelte';
	import MathEquation from '../lib/components/MathEquation.svelte';
	import { simulationStore } from '../lib/stores/simulation';
	
	// LaTeX equations
	const equation1D = 'm\\ddot{x} + c\\dot{x} + kx = mg';
	const equation2D = 'm\\ddot{\\vec{r}} + c\\dot{r}\\hat{r} + k(r - L_0)\\hat{r} = m\\vec{g}';
	
	// Regime-specific solution equations
	const underdampedSolution = 'x(t) = e^{-\\zeta\\omega_n t}(A\\cos(\\omega_d t) + B\\sin(\\omega_d t))';
	const criticalSolution = 'x(t) = e^{-\\omega_n t}(A + Bt)';
	const overdampedSolution = 'x(t) = Ae^{r_1 t} + Be^{r_2 t}';
	
	// Mode toggle
	let is2DMode = false;
	
	function toggleMode() {
		const newMode = is2DMode ? 'VECTOR' : '1D';
		simulationStore.updateParams({ mode: newMode });
	}

	// Chart modal state
	let chartModalOpen = false;
	let chartModalType: 'phase' | 'strip' = 'phase';

	function openChartModal(type: 'phase' | 'strip') {
		chartModalType = type;
		chartModalOpen = true;
	}

	function closeChartModal() {
		chartModalOpen = false;
	}
	
	// Physics parameters with safer initial values
	let mass = 1.0;
	let springConstant = 10.0;
	let damping = 0.5;
	let useCriticalDamping = false;

	// Calculate critical damping
	$: criticalDamping = 2 * Math.sqrt(mass * springConstant);

	// Auto-update damping when critical damping checkbox is checked
	$: if (useCriticalDamping) {
		damping = criticalDamping;
		updateParameters();
	}

	// Live equations with current values
	$: liveODE1D = `${mass.toFixed(1)}\\ddot{x} + ${damping.toFixed(1)}\\dot{x} + ${springConstant.toFixed(1)}x = ${(mass * 9.81).toFixed(1)}`;
	$: currentR = $simulationStore.position ? Math.hypot($simulationStore.position.x, $simulationStore.position.y) : 1.0;
	$: liveODE2D = `${mass.toFixed(1)}\\ddot{\\vec{r}} + ${damping.toFixed(1)}\\dot{r}\\hat{r} + ${springConstant.toFixed(1)}(${currentR.toFixed(2)} - 1.0)\\hat{r} = ${mass.toFixed(1)}\\vec{g}`;
	
	// Calculate equilibrium positions
	$: equilibrium1D = 1.0 + (mass * 9.81) / springConstant;  // L0 + mg/k
	$: equilibrium2D = 1.0 + (mass * 9.81) / springConstant;  // Same for 2D radial
	
	// Calculate A and B coefficients from initial conditions
	$: x0 = $simulationStore.initialPosition ? 
		($simulationStore.params?.mode === 'VECTOR' ? 
			// 2D: displacement from equilibrium radius (r - r_eq)
			Math.hypot($simulationStore.initialPosition.x, $simulationStore.initialPosition.y) - equilibrium2D :
			// 1D: displacement from equilibrium position
			$simulationStore.initialPosition.x - equilibrium1D) : 0.2;
	$: v0 = $simulationStore.initialVelocity && $simulationStore.params?.mode === 'VECTOR' ? 
		// 2D: radial velocity component (v⃗ · r̂)
		(() => {
			const x = $simulationStore.initialPosition?.x || 0;
			const y = $simulationStore.initialPosition?.y || 0;
			const vx = $simulationStore.initialVelocity?.x || 0;
			const vy = $simulationStore.initialVelocity?.y || 0;
			const r = Math.hypot(x, y);
			return r > 1e-9 ? (vx * x + vy * y) / r : 0;
		})() :
		// 1D: x velocity
		$simulationStore.initialVelocity?.x || 0.0;

	$: A = x0;
	$: B = $simulationStore.analytical ? 
		($simulationStore.analytical.case === 'underdamped' ? 
			(v0 + $simulationStore.analytical.zeta * $simulationStore.analytical.omega_n * x0) / $simulationStore.analytical.omega_d : 
			v0 + $simulationStore.analytical.omega_n * x0) : 0;

	// Live solutions with actual A and B values
	$: liveSolutionUnderdamped = $simulationStore.analytical ? 
		`x(t) = e^{-${$simulationStore.analytical.zeta?.toFixed(3) || '0.000'} \\cdot ${$simulationStore.analytical.omega_n?.toFixed(3) || '0.000'} t}(${A.toFixed(3)}\\cos(${$simulationStore.analytical.omega_d?.toFixed(3) || '0.000'} t) + ${B.toFixed(3)}\\sin(${$simulationStore.analytical.omega_d?.toFixed(3) || '0.000'} t))` : '';
	
	$: liveSolutionCritical = $simulationStore.analytical ? 
		`x(t) = e^{-${$simulationStore.analytical.omega_n?.toFixed(3) || '0.000'} t}(${A.toFixed(3)} + ${B.toFixed(3)}t)` : '';
	
	$: liveSolutionOverdamped = $simulationStore.analytical ? 
		`x(t) = ${A.toFixed(3)}e^{${$simulationStore.analytical.r1?.toFixed(3) || '0.000'} t} + ${B.toFixed(3)}e^{${$simulationStore.analytical.r2?.toFixed(3) || '0.000'} t}` : '';

	// Throttle parameter updates to prevent overwhelming the simulation
	let updateTimeout: number;
	
	function updateParameters() {
		clearTimeout(updateTimeout);
		updateTimeout = setTimeout(() => {
			simulationStore.updateParams({
				m: mass,
				k: springConstant,
				c: damping
			});
		}, 50);
	}
	
	onMount(async () => {
		console.log('Initializing simulation store...');
		try {
			await simulationStore.init();
			// Start paused - user must drag and release to begin
			console.log('Simulation store initialized (paused)');
		} catch (error) {
			console.error('Failed to initialize simulation store:', error);
		}

		// Add keyboard shortcut for emergency restart (Ctrl+Shift+R)
		function handleKeydown(event: KeyboardEvent) {
			if (event.ctrlKey && event.shiftKey && event.key === 'R') {
				event.preventDefault();
				console.log('Emergency restart triggered via keyboard');
				restartSimulation();
			}
		}

		document.addEventListener('keydown', handleKeydown);

		return () => {
			document.removeEventListener('keydown', handleKeydown);
		};
	});
	
	function pauseSimulation() {
		simulationStore.stop();
	}
	
	let isResetting = false;
	
	async function resetSimulation() {
		if (isResetting) return; // Prevent multiple simultaneous resets
		
		console.log('Hard reset button clicked');
		isResetting = true;
		
		try {
			// Stop simulation immediately
			simulationStore.stop();
			
			// Clear any pending parameter updates
			clearTimeout(updateTimeout);
			
			// Wait a bit for everything to settle
			await new Promise(resolve => setTimeout(resolve, 200));
			
			// Hard reset: reinitialize the worker and reset all state
			await simulationStore.init();
			
			// Wait a bit more for worker to initialize
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Reset parameters to current UI values
			simulationStore.updateParams({
				m: mass,
				k: springConstant,
				c: damping
			});
			
			// Final reset of position to initial
			await new Promise(resolve => setTimeout(resolve, 100));
			simulationStore.reset();
			
		} catch (error) {
			console.error('Failed to hard reset simulation:', error);
		} finally {
			isResetting = false;
		}
	}

	// Emergency restart function if simulation gets into weird state
	function restartSimulation() {
		console.log('Restarting simulation');
		simulationStore.stop();
		clearTimeout(updateTimeout);
		setTimeout(async () => {
			try {
				await simulationStore.init();
				updateParameters();
			} catch (error) {
				console.error('Failed to restart simulation:', error);
			}
		}, 500);
	}
	
</script>

<svelte:head>
	<title>Interactive Spring Sandbox</title>
	<meta name="description" content="Educational spring-mass physics simulation" />
</svelte:head>

<main class="app">
	<header>
		<h1>Interactive Spring Sandbox</h1>
		<p>Real-time physics simulation with analytical solutions</p>
	</header>

	<div class="layout">
		<!-- Left column: Simulation -->
		<section class="sim-section">
			<div class="canvas-section">
				<div class="sim-header">
					<div class="controls-row">
						<div class="main-controls">
							<button on:click={pauseSimulation}>Pause</button>
							<button on:click={resetSimulation}>Reset</button>
							<div class="mode-toggle">
								<label>
									<input 
										type="checkbox" 
										bind:checked={is2DMode}
										on:change={toggleMode}
									/>
									2D Mode
								</label>
							</div>
						</div>
						<div class="physics-controls">
							<div class="inline-control">
								<label for="mass">Mass</label>
								<input 
									id="mass"
									type="range" 
									min="0.2" 
									max="3.0" 
									step="0.05" 
									bind:value={mass}
									on:input={updateParameters}
								/>
								<span class="value">{mass.toFixed(2)}</span>
							</div>
							<div class="inline-control">
								<label for="spring">Spring</label>
								<input 
									id="spring"
									type="range" 
									min="2" 
									max="80" 
									step="0.5" 
									bind:value={springConstant}
									on:input={updateParameters}
								/>
								<span class="value">{springConstant.toFixed(1)}</span>
							</div>
							<div class="inline-control">
								<label for="damping">Damping</label>
								<div class="slider-container">
									<input 
										id="damping"
										type="range" 
										min="0" 
										max="25" 
										step="0.1" 
										bind:value={damping}
										on:input={updateParameters}
										disabled={useCriticalDamping}
									/>
									{#if criticalDamping <= 25}
										<div 
											class="critical-tick" 
											style="left: {(criticalDamping / 25) * 100}%"
											title="Critical damping: {criticalDamping.toFixed(1)}"
											on:click={() => { damping = criticalDamping; updateParameters(); }}
										></div>
									{/if}
								</div>
								<span class="value">{damping.toFixed(1)}</span>
								<label class="critical-checkbox">
									<input 
										type="checkbox" 
										bind:checked={useCriticalDamping}
										on:change={() => { if (!useCriticalDamping) updateParameters(); }}
									/>
									<span class="checkbox-label">Critical</span>
								</label>
							</div>
						</div>
					</div>
				</div>
				
				<div class="sim-content">
					<div class="canvas-wrapper">
						<SpringCanvas />
					</div>
					<div class="instructions">
						Click and drag the mass to set initial position, then release to start simulation
					</div>
				</div>

				<!-- Mini charts -->
				<div class="sim-bottom">
					<div class="sim-charts">
						<div class="mini-chart" on:click={() => openChartModal('phase')}>
							<h4>Phase Portrait</h4>
							<div class="mini-chart-container">
								<PlotlyChart type="phase" mini={true} />
							</div>
							<div class="expand-hint">Click to expand</div>
						</div>
						<div class="mini-chart" on:click={() => openChartModal('strip')}>
							<h4>Time Series</h4>
							<div class="mini-chart-container">
								<PlotlyChart type="strip" mini={true} />
							</div>
							<div class="expand-hint">Click to expand</div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<!-- Right sidebar: Live Equations -->
		<section class="sidebar">
			<div class="card">
				<h2>Live Equations</h2>

				<div class="equation-display">
					{#if $simulationStore.params?.mode === '1D'}
						<MathEquation equation={equation1D} displayMode={true} />
					{:else}
						<MathEquation equation={equation2D} displayMode={true} />
					{/if}
				</div>

				<!-- ODE with Current Values -->
				<div class="equation-with-values">
					<h4>ODE with Current Values</h4>
					<div class="equation-display">
						{#if $simulationStore.params?.mode === '1D'}
							<MathEquation equation={liveODE1D} displayMode={true} />
						{:else}
							<MathEquation equation={liveODE2D} displayMode={true} />
						{/if}
					</div>
				</div>
				{#if $simulationStore.analytical}
					<div class="analytical-display">
						<h3>Analytical Solution</h3>
						<div class="regime-header">
							<strong>Regime:</strong> 
							<span class="regime-name">{$simulationStore.analytical.case}</span>
							<span class="damping-ratio">ζ = {$simulationStore.analytical?.zeta?.toFixed(3) || '0.000'}</span>
						</div>
						
						<div class="solution-equation">
							{#if $simulationStore.analytical.case === 'underdamped'}
								<MathEquation equation={underdampedSolution} displayMode={true} />
							{:else if $simulationStore.analytical.case === 'critical'}
								<MathEquation equation={criticalSolution} displayMode={true} />
							{:else if $simulationStore.analytical.case === 'overdamped'}
								<MathEquation equation={overdampedSolution} displayMode={true} />
							{/if}
						</div>

						<!-- Solution with Current Values -->
						<div class="equation-with-values">
							<h4>Solution with Current Values</h4>
							<div class="equation-display">
								{#if $simulationStore.analytical.case === 'underdamped'}
									<MathEquation equation={liveSolutionUnderdamped} displayMode={true} />
								{:else if $simulationStore.analytical.case === 'critical'}
									<MathEquation equation={liveSolutionCritical} displayMode={true} />
								{:else if $simulationStore.analytical.case === 'overdamped'}
									<MathEquation equation={liveSolutionOverdamped} displayMode={true} />
								{/if}
							</div>
						</div>
					</div>
				{/if}
			</div>
		</section>
	</div>

	<!-- Chart Modal -->
	{#if chartModalOpen}
		<div class="modal-overlay" on:click={closeChartModal}>
			<div class="modal-content" on:click|stopPropagation>
				<div class="modal-header">
					<h3>{chartModalType === 'phase' ? 'Phase Portrait' : 'Time Series'}</h3>
					<button class="close-btn" on:click={closeChartModal}>×</button>
				</div>
				<div class="modal-chart">
					<PlotlyChart type={chartModalType} mini={false} />
				</div>
			</div>
		</div>
	{/if}
</main>

<style>
	.app {
		margin: 0;
		padding: 20px 0;
	}

	header {
		text-align: center;
		margin-bottom: 30px;
		padding: 0 20px;
	}

	h1 {
		margin: 0 0 10px 0;
		font-size: 24px;
		font-weight: normal;
	}

	header p {
		margin: 0;
		font-size: 14px;
		color: #666;
	}

	.layout {
		display: grid;
		grid-template-columns: 800px 600px;
		gap: 30px;
		padding: 0 20px;
	}

	.sim-section {
		display: flex;
		flex-direction: column;
	}

	.canvas-section {
		background: #fff;
		border: 1px solid #ddd;
		padding: 20px;
	}

	.sim-header {
		margin-bottom: 20px;
		padding-bottom: 15px;
	}

	.controls-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		flex-wrap: wrap;
	}

	.main-controls {
		display: flex;
		align-items: center;
		gap: 15px;
	}

	.main-controls button {
		padding: 10px 18px;
		border: 1px solid #ccc;
		background: #f5f5f5;
		cursor: pointer;
		font-size: 13px;
		border-radius: 4px;
	}

	.main-controls button:hover {
		background: #e5e5e5;
	}

	.physics-controls {
		display: flex;
		align-items: center;
		gap: 20px;
		flex-wrap: wrap;
	}

	.inline-control {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}

	.inline-control label {
		font-weight: normal;
		color: #333;
		min-width: 55px;
		text-align: right;
	}

	.slider-container {
		position: relative;
		display: inline-block;
	}

	.inline-control input[type="range"] {
		width: 90px;
	}

	.critical-tick {
		position: absolute;
		top: 50%;
		transform: translateX(-50%) translateY(-50%);
		width: 3px;
		height: 12px;
		background: #ff6b35;
		border-radius: 1px;
		cursor: pointer;
		z-index: 10;
		pointer-events: auto;
	}

	.critical-tick:hover {
		background: #ff4500;
		width: 4px;
		height: 14px;
	}

	.critical-checkbox {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 8px;
		font-size: 11px;
		cursor: pointer;
	}

	.critical-checkbox input[type="checkbox"] {
		margin: 0;
		width: 12px;
		height: 12px;
	}

	.checkbox-label {
		color: #666;
		font-size: 10px;
	}

	.inline-control .value {
		font-family: monospace;
		background: #f0f0f0;
		padding: 3px 8px;
		border: 1px solid #ccc;
		border-radius: 3px;
		min-width: 40px;
		text-align: center;
		font-size: 11px;
	}

	.sim-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 15px;
	}

	.instructions {
		font-size: 13px;
		color: #666;
		font-style: italic;
		text-align: center;
		padding: 8px 16px;
		background: #f8f8f8;
		border: 1px solid #eee;
		border-radius: 4px;
		max-width: 400px;
	}

	.canvas-wrapper {
		display: inline-block;
	}

	.sim-bottom {
		display: flex;
		gap: 20px;
		margin-top: 20px;
		align-items: flex-start;
	}

	.sim-values {
		display: flex;
		flex-direction: column;
		gap: 15px;
		min-width: 200px;
	}

	.sim-values .live-values {
		background: #f8f8f8;
		border: 1px solid #ddd;
		padding: 12px;
		border-radius: 4px;
	}

	.sim-values .live-values h3 {
		margin: 0 0 8px 0;
		font-size: 13px;
		font-weight: normal;
		color: #333;
		border-bottom: 1px solid #ddd;
		padding-bottom: 4px;
	}

	.sim-values .values {
		font-family: monospace;
		font-size: 11px;
	}

	.sim-values .values p {
		margin: 4px 0;
	}

	.sim-charts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 15px;
		flex: 1;
	}

	.mini-chart {
		background: #f8f8f8;
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 8px;
		cursor: pointer;
		transition: background-color 0.2s;
		min-width: 0;
	}

	.mini-chart:hover {
		background: #f0f0f0;
	}

	.mini-chart h4 {
		margin: 0 0 6px 0;
		font-size: 11px;
		font-weight: normal;
		color: #333;
		text-align: center;
	}

	.mini-chart-container {
		height: 140px;
		width: 100%;
		border: 1px solid #eee;
		background: white;
		border-radius: 3px;
	}

	.expand-hint {
		font-size: 10px;
		color: #666;
		text-align: center;
		margin-top: 5px;
		font-style: italic;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1000;
	}

	.modal-content {
		background: white;
		border-radius: 8px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		width: 90%;
		max-width: 800px;
		max-height: 90vh;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid #eee;
	}

	.modal-header h3 {
		margin: 0;
		font-size: 18px;
		font-weight: normal;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 24px;
		cursor: pointer;
		padding: 0;
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
	}

	.close-btn:hover {
		background: #f0f0f0;
	}

	.modal-chart {
		padding: 20px;
		height: 600px;
	}

	.mode-toggle {}

	.mode-toggle label {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		cursor: pointer;
	}

	.mode-toggle input[type="checkbox"] {
		margin: 0;
	}


	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.card {
		background: #fff;
		border: 1px solid #ddd;
		padding: 15px;
	}

	h2 {
		margin: 0 0 15px 0;
		font-size: 16px;
		font-weight: normal;
		border-bottom: 1px solid #eee;
		padding-bottom: 8px;
	}

	.equation-display {
		text-align: center;
		padding: 15px;
		background: #f8f8f8;
		border: 1px solid #eee;
		margin-bottom: 15px;
	}

	.parameter-display, .live-values, .analytical-display, .live-equations-section {
		margin-bottom: 20px;
	}

	.live-values {
		background: #f8f8f8;
		border: 1px solid #ddd;
		padding: 15px;
		border-radius: 4px;
		margin-bottom: 20px;
	}

	.equation-display {
		background: #f8f8f8;
		border: 1px solid #eee;
		padding: 15px;
		text-align: center;
		margin-bottom: 10px;
		border-radius: 4px;
	}

	.equation-with-values {
		background: #f8f8f8;
		border: 1px solid #ddd;
		padding: 12px;
		margin-bottom: 15px;
		border-radius: 4px;
	}

	.equation-with-values h4 {
		margin: 0 0 10px 0;
		font-size: 12px;
		font-weight: bold;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		border-bottom: 1px solid #ddd;
		padding-bottom: 6px;
	}

	.equation-with-values .equation-display {
		margin-bottom: 0;
		background: white;
		border: 1px solid #ddd;
	}

	.regime-header {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 15px;
		padding: 8px 12px;
		background: #f0f0f0;
		border: 1px solid #ddd;
		font-size: 13px;
	}

	.regime-name {
		font-weight: bold;
		color: #333;
		text-transform: capitalize;
	}

	.damping-ratio {
		font-family: monospace;
		background: #e8e8e8;
		padding: 2px 6px;
		border-radius: 3px;
	}

	.solution-equation {
		text-align: center;
		padding: 15px;
		background: #f8f8f8;
		border: 1px solid #eee;
		margin-bottom: 15px;
	}

	.parameter-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 6px;
	}

	.param-row {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #f8f8f8;
		padding: 6px 10px;
		border: 1px solid #eee;
	}

	.unit {
		font-size: 11px;
		color: #666;
		font-style: italic;
	}

	h3 {
		margin: 0 0 8px 0;
		font-size: 14px;
		font-weight: normal;
		color: #333;
		border-bottom: 1px solid #eee;
		padding-bottom: 4px;
	}


	.values {
		font-family: monospace;
		font-size: 12px;
	}

	.values p {
		margin: 5px 0;
	}

	@media (max-width: 768px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>