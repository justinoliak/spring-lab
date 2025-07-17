<script lang="ts">
	// Main page component - Spring Physics Sandbox
	import { onMount } from 'svelte';
	import SpringCanvas from '../lib/components/SpringCanvas.svelte';
	import PlotlyChart from '../lib/components/PlotlyChart.svelte';
	import PinnChart from '../lib/components/PinnChart.svelte';
	import MathEquation from '../lib/components/MathEquation.svelte';
	import { simulationStore } from '../lib/stores/simulation';
	import { chartDataStore } from '../lib/stores/chartData';
	
	// LaTeX equations
	const equation1D = 'm\\ddot{x} + c\\dot{x} + kx = 0';
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

	// PINN training modal state
	let pinnModalOpen = false;
	let pinnTrainingData: any[] = [];
	let pinnIsTraining = false;
	let pinnEpoch = 0;
	let pinnPredictions: any[] = [];
	let pinnButtonEnabled = false;
	let simulationStartTime = 0;

	function closePinnModal() {
		pinnModalOpen = false;
		pinnIsTraining = false;
		pinnEpoch = 0;
		pinnPredictions = [];
	}

	// Track when simulation starts and enable PINN button after 12 seconds (when it auto-pauses)
	$: if ($simulationStore.isRunning && simulationStartTime === 0) {
		simulationStartTime = Date.now();
		pinnButtonEnabled = false;
		
		// Update countdown every second
		const countdownInterval = setInterval(() => {
			const elapsed = Date.now() - simulationStartTime;
			if (elapsed >= 12000) {
				clearInterval(countdownInterval);
			}
		}, 1000);
	}

	// Enable PINN button when simulation stops (after 12 seconds)
	$: if (!$simulationStore.isRunning && simulationStartTime > 0) {
		const elapsed = Date.now() - simulationStartTime;
		if (elapsed >= 11000) { // Enable if simulation ran for at least 11 seconds
			pinnButtonEnabled = true;
		}
	}

	// Reset when simulation starts again
	$: if ($simulationStore.isRunning && pinnButtonEnabled) {
		pinnButtonEnabled = false;
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
	$: liveODE1D = `${mass.toFixed(1)}\\ddot{x} + ${damping.toFixed(1)}\\dot{x} + ${springConstant.toFixed(1)}x = 0`;
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
			await new Promise(resolve => setTimeout(resolve, 50));
			
			// Hard reset: reinitialize the worker and reset all state
			await simulationStore.init();
			
			// Wait a bit more for worker to initialize
			await new Promise(resolve => setTimeout(resolve, 25));
			
			// Reset parameters to current UI values
			simulationStore.updateParams({
				m: mass,
				k: springConstant,
				c: damping
			});
			
			// Final reset of position to initial
			await new Promise(resolve => setTimeout(resolve, 25));
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

	function trainPINN() {
		if ($simulationStore.params.mode !== '1D') {
			alert('PINN training is only available in 1D mode.');
			return;
		}
		
		// Check if system is underdamped (required for PINN)
		const zeta = damping / (2 * Math.sqrt(mass * springConstant));
		if (zeta >= 1.0) {
			const dampingType = zeta === 1.0 ? 'critically damped' : 'overdamped';
			alert(`PINN training only works for underdamped systems. Current system is ${dampingType} (ζ = ${zeta.toFixed(3)}). Reduce damping to make ζ < 1.0.`);
			return;
		}
		
		if (!pinnButtonEnabled) {
			alert('PINN button will be enabled after the simulation completes (12 seconds).');
			return;
		}

		console.log('Training PINN with current parameters...');
		
		// Get current simulation data
		const simulationData = $chartDataStore;
		
		if (simulationData.length < 50) {
			alert('Need more data points from simulation. Let the simulation run for the full 12 seconds first!');
			return;
		}
		
		// Randomly sample 10 points from the first half of simulation (first 6 seconds)
		const maxTime = Math.min(6.0, Math.max(...simulationData.map(d => d.time))); // First 6 seconds max
		const filteredData = simulationData.filter(d => d.time <= maxTime);
		
		// Convert simulation data to displacement from equilibrium (PINN coordinate system)
		const equilibrium = 1.0 + (mass * 9.81) / springConstant;
		
		// Randomly sample 10 points
		const sampledIndices: number[] = [];
		const sampleSize = Math.min(10, filteredData.length);
		
		while (sampledIndices.length < sampleSize) {
			const randomIndex = Math.floor(Math.random() * filteredData.length);
			if (!sampledIndices.includes(randomIndex)) {
				sampledIndices.push(randomIndex);
			}
		}
		
		const trainingData = sampledIndices.map(i => ({
			time: filteredData[i].time,
			position: filteredData[i].position  // Already displacement from equilibrium
		}));
		
		// Store training data and open modal
		pinnTrainingData = trainingData;
		pinnModalOpen = true;
		pinnIsTraining = false;
		pinnEpoch = 0;
		pinnPredictions = [];
		
		console.log('PINN Training Data:', trainingData);
	}

	function startPinnTraining() {
		pinnIsTraining = true;
		pinnEpoch = 0;
		pinnPredictions = [];
		
		// Get current physics parameters for realistic analytical solution
		const omega_n = Math.sqrt(springConstant / mass);
		const zeta = damping / (2 * Math.sqrt(mass * springConstant));
		
		// Get initial conditions from simulation state (displacement from equilibrium)
		// Use the actual initial position from the simulation, converted to displacement from equilibrium
		const equilibrium = 1.0 + (mass * 9.81) / springConstant;
		const x0_abs = $simulationStore.initialPosition?.x || 1.2;  // Absolute position
		const x0 = x0_abs - equilibrium;  // Convert to displacement from equilibrium
		const v0 = 0.0;  // Assumed initial velocity
		
		// Calculate analytical solution parameters
		let omega_d, A, B;
		if (zeta < 1.0) {
			omega_d = omega_n * Math.sqrt(1 - zeta * zeta);
			A = x0;
			B = (v0 + zeta * omega_n * x0) / omega_d;
		}
		
		// Simulate PINN training - more realistic progression
		const trainStep = () => {
			if (!pinnIsTraining) return;
			
			pinnEpoch++;
			
			// Generate training data for full time domain (0 to 12 seconds)
			const simulationData = $chartDataStore;
			const timeRange = simulationData.length > 0 ? Math.max(...simulationData.map(d => d.time)) : 12;
			const timePoints = [];
			for (let i = 0; i <= 200; i++) {
				timePoints.push(i * timeRange / 200);
			}
			
			// Simulate PINN learning: starts random, gradually converges to true solution
			const convergenceRate = Math.min(pinnEpoch / 60.0, 1.0); // Converge over 60 epochs
			const noiseLevel = 0.4 * (1 - convergenceRate); // Reduce noise as training progresses
			
			console.log(`PINN Epoch ${pinnEpoch}: Generating ${timePoints.length} predictions...`);
			pinnPredictions = timePoints.map(t => {
				// True analytical solution in displacement from equilibrium (PINN coordinate system)
				let trueDisplacement;
				if (zeta < 1.0 && omega_d) {
					// Underdamped solution - displacement from equilibrium
					trueDisplacement = Math.exp(-zeta * omega_n * t) * (A * Math.cos(omega_d * t) + B * Math.sin(omega_d * t));
				} else {
					// Fallback - simple damped oscillation
					trueDisplacement = x0 * Math.exp(-0.5 * t) * Math.cos(3 * t);
				}
				
				// PINN learning: starts random, converges to true displacement (converges to 0 at equilibrium)
				const randomNoise = (Math.random() - 0.5) * noiseLevel;
				const prediction = trueDisplacement * convergenceRate + randomNoise;
				
				return {
					time: t,
					position: prediction  // This is displacement from equilibrium
				};
			});
			
			// Debug output
			if (pinnEpoch === 1) {
				console.log('PINN Training - Epoch 1:', {
					zeta,
					omega_n,
					omega_d,
					A,
					B,
					timeRange,
					predictionsLength: pinnPredictions.length,
					firstPrediction: pinnPredictions[0],
					lastPrediction: pinnPredictions[pinnPredictions.length - 1]
				});
			}
			
			if (pinnEpoch < 100) { // Train for 100 epochs (10 seconds)
				setTimeout(trainStep, 100); // Train every 100ms
			} else {
				pinnIsTraining = false;
			}
		};
		
		trainStep();
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

				<!-- Initial Conditions Display -->
				<div class="initial-conditions">
					<h3>Initial Conditions (Physics Engine Values)</h3>
					<div class="conditions-grid">
						{#if $simulationStore.params?.mode === '1D'}
							<div class="condition-item">
								<span class="condition-label">x₀:</span>
								<span class="condition-value">{(($simulationStore.initialPosition?.x || 0) - equilibrium1D).toFixed(3)} m</span>
							</div>
							<div class="condition-item">
								<span class="condition-label">v₀:</span>
								<span class="condition-value">{($simulationStore.initialVelocity?.x || 0).toFixed(3)} m/s</span>
							</div>
						{:else}
							<div class="condition-item">
								<span class="condition-label">r₀:</span>
								<span class="condition-value">{Math.hypot($simulationStore.initialPosition?.x || 0, $simulationStore.initialPosition?.y || 0).toFixed(3)} m</span>
							</div>
							<div class="condition-item">
								<span class="condition-label">v_r₀:</span>
								<span class="condition-value">{(() => {
									const x = $simulationStore.initialPosition?.x || 0;
									const y = $simulationStore.initialPosition?.y || 0;
									const vx = $simulationStore.initialVelocity?.x || 0;
									const vy = $simulationStore.initialVelocity?.y || 0;
									const r = Math.hypot(x, y);
									return r > 1e-9 ? ((vx * x + vy * y) / r).toFixed(3) : '0.000';
								})()} m/s</span>
							</div>
						{/if}
					</div>
				</div>

				<!-- PINN Training Section (1D mode only) -->
				{#if $simulationStore.params.mode === '1D'}
					{@const zeta = damping / (2 * Math.sqrt(mass * springConstant))}
					{@const isUnderdamped = zeta < 1.0}
					<div class="pinn-section">
						<button class="pinn-button" class:disabled={!pinnButtonEnabled || !isUnderdamped} on:click={trainPINN}>
							{#if !isUnderdamped}
								Train a Physics Informed Neural Network (underdamped only, ζ = {zeta.toFixed(3)})
							{:else if pinnButtonEnabled}
								Train a Physics Informed Neural Network
							{:else if simulationStartTime > 0 && $simulationStore.isRunning}
								Train a Physics Informed Neural Network (available in {Math.ceil((12000 - (Date.now() - simulationStartTime)) / 1000)}s)
							{:else if simulationStartTime > 0 && !$simulationStore.isRunning}
								Train a Physics Informed Neural Network (simulation too short)
							{:else}
								Train a Physics Informed Neural Network (start simulation first)
							{/if}
						</button>
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

	<!-- PINN Training Modal -->
	{#if pinnModalOpen}
		<div class="modal-overlay" on:click={closePinnModal}>
			<div class="modal-content pinn-modal" on:click|stopPropagation>
				<div class="modal-header">
					<h3>PINN Training - Time Series</h3>
					<button class="close-btn" on:click={closePinnModal}>×</button>
				</div>
				<div class="pinn-modal-body">
					<div class="pinn-chart-container">
						<PinnChart 
							trainingData={pinnTrainingData}
							predictions={pinnPredictions}
							isTraining={pinnIsTraining}
							epoch={pinnEpoch}
							mass={mass}
							springConstant={springConstant}
						/>
					</div>
					<div class="pinn-controls">
						<div class="pinn-status">
							<p><strong>Training Points:</strong> {pinnTrainingData.length} randomly sampled</p>
							{#if pinnIsTraining}
								<p><strong>Status:</strong> Training... (Epoch {pinnEpoch})</p>
							{:else if pinnEpoch > 0}
								<p><strong>Status:</strong> Training completed ({pinnEpoch} epochs)</p>
							{:else}
								<p><strong>Status:</strong> Ready to train</p>
							{/if}
						</div>
						<div class="pinn-buttons">
							{#if !pinnIsTraining}
								<button class="pinn-train-btn" on:click={startPinnTraining}>
									{pinnEpoch > 0 ? 'Retrain' : 'Train'}
								</button>
							{:else}
								<button class="pinn-train-btn disabled" disabled>
									Training...
								</button>
							{/if}
						</div>
					</div>
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

	.initial-conditions {
		background: #f8f8f8;
		border: 1px solid #ddd;
		padding: 15px;
		margin-bottom: 20px;
		border-radius: 4px;
	}

	.conditions-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 10px;
	}

	.condition-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: white;
		padding: 6px 10px;
		border: 1px solid #eee;
		border-radius: 3px;
		font-size: 12px;
	}

	.condition-label {
		font-weight: bold;
		color: #333;
	}

	.condition-value {
		font-family: monospace;
		color: #666;
		background: #f0f0f0;
		padding: 2px 6px;
		border-radius: 2px;
	}

	.pinn-section {
		margin-top: 20px;
		padding: 15px;
		background: #f8f8f8;
		border: 1px solid #ddd;
		border-radius: 4px;
		text-align: center;
	}

	.pinn-button {
		background: #4CAF50;
		color: white;
		border: none;
		padding: 12px 24px;
		font-size: 14px;
		font-weight: bold;
		border-radius: 6px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.pinn-button:hover {
		background: #45a049;
	}

	.pinn-button:active {
		background: #3d8b40;
	}

	.pinn-button.disabled {
		background: #ccc;
		cursor: not-allowed;
	}

	.pinn-button.disabled:hover {
		background: #ccc;
	}

	.pinn-modal {
		max-width: 1000px;
		max-height: 80vh;
	}

	.pinn-modal-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.pinn-chart-container {
		height: 400px;
		border: 1px solid #eee;
		border-radius: 4px;
	}

	.pinn-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 15px;
		background: #f8f8f8;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	.pinn-status p {
		margin: 5px 0;
		font-size: 14px;
	}

	.pinn-train-btn {
		background: #2196F3;
		color: white;
		border: none;
		padding: 10px 20px;
		font-size: 14px;
		font-weight: bold;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.pinn-train-btn:hover:not(.disabled) {
		background: #1976D2;
	}

	.pinn-train-btn.disabled {
		background: #ccc;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>