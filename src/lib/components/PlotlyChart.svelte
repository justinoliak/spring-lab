<script lang="ts">
	// Plotly.js charts for phase portraits and strip charts
	import { onMount } from 'svelte';
	import { simulationStore } from '../stores/simulation';
	
	export let type: 'phase' | 'strip';
	export let mini: boolean = false;
	
	let chartDiv: HTMLDivElement;
	let Plotly: any;
	import { chartDataStore, addDataPoint, type ChartDataPoint } from '../stores/chartData';
	
	let dataBuffer: ChartDataPoint[] = [];
	let lastTime = -1; // Track previous time to detect resets
	let updateCounter = 0; // Skip some updates for performance

	onMount(async () => {
		// Dynamically import Plotly to avoid SSR issues
		Plotly = await import('plotly.js-dist-min');
		
		initChart();
		
		// Subscribe to shared chart data
		const unsubscribeChart = chartDataStore.subscribe(data => {
			dataBuffer = data;
			if (Plotly && chartDiv) {
				if (type === 'phase') {
					updatePhasePortrait();
				} else {
					updateStripChart();
				}
			}
		});
		
		// Subscribe to simulation data updates to add new points
		const unsubscribeSim = simulationStore.subscribe(data => {
			updateChart(data);
		});
		
		return () => {
			unsubscribeChart();
			unsubscribeSim();
		};
	});

	function initChart() {
		if (!Plotly) return;
		
		if (type === 'phase') {
			initPhasePortrait();
		} else {
			initStripChart();
		}
	}

	function initPhasePortrait() {
		const data = [{
			x: [],
			y: [],
			mode: 'lines+markers',
			type: 'scatter',
			name: 'Phase Portrait',
			line: { color: '#007bff' },
			marker: { size: 3 }
		}];

		const layout = {
			title: '',
			xaxis: { 
				title: mini ? '' : 'Position (m)',
				range: [-3, 3],
				fixedrange: true,
				showticklabels: !mini
			},
			yaxis: { 
				title: mini ? '' : 'Velocity (m/s)',
				range: [-8, 8],
				fixedrange: true,
				showticklabels: !mini
			},
			margin: mini ? { l: 25, r: 12, t: 10, b: 25 } : { l: 60, r: 30, t: 30, b: 60 },
			height: mini ? 140 : 500
		};

		const config = {
			displayModeBar: false,
			responsive: true,
			staticPlot: false
		};

		Plotly.newPlot(chartDiv, data, layout, config);
	}

	function initStripChart() {
		const data = [{
			x: [],
			y: [],
			mode: 'lines',
			type: 'scatter',
			name: 'Position',
			line: { color: '#28a745' }
		}];

		const layout = {
			title: '',
			xaxis: { 
				title: mini ? '' : 'Time (s)',
				range: [0, 15],
				fixedrange: true,
				showticklabels: !mini
			},
			yaxis: { 
				title: mini ? '' : 'Position (m)',
				range: [-3, 3],
				fixedrange: true,
				showticklabels: !mini
			},
			margin: mini ? { l: 25, r: 12, t: 10, b: 25 } : { l: 60, r: 30, t: 30, b: 60 },
			height: mini ? 140 : 500
		};

		const config = {
			displayModeBar: false,
			responsive: true,
			staticPlot: false
		};

		Plotly.newPlot(chartDiv, data, layout, config);
	}

	function updateChart(simData: any) {
		if (!Plotly || !chartDiv || !simData.position || !simData.velocity) return;
		
		const currentTime = simData.time || 0;
		
		// Only collect data when simulation is actually running (after mouse release)
		if (!simData.isRunning) return;
		
		// Skip some updates for performance (update every 3rd frame for mini charts)
		updateCounter++;
		if (mini && updateCounter % 3 !== 0) return;
		
		// Track time for reset detection
		lastTime = currentTime;
		
		// Calculate equilibrium positions using actual simulation parameters
		const mass = simData.params?.m || 1.0;
		const springConstant = simData.params?.k || 10.0;
		const equilibrium = 1.0 + (mass * 9.81) / springConstant; // L0 + mg/k
		
		// Use appropriate coordinate for display
		const position = simData.params?.mode === 'VECTOR' ? 
			Math.hypot(simData.position.x, simData.position.y) - equilibrium : // 2D: distance from equilibrium 
			simData.position.x - equilibrium; // 1D: displacement from equilibrium
		
		const velocity = simData.params?.mode === 'VECTOR' ?
			// 2D: velocity magnitude for phase portrait visualization
			Math.hypot(simData.velocity.x, simData.velocity.y) :
			simData.velocity.x; // 1D: x-velocity
		
		// Add to shared store
		addDataPoint(currentTime, position, velocity);
	}
	
	function updatePhasePortrait() {
		if (dataBuffer.length === 0) return;
		
		const positions = dataBuffer.map(d => d.position);
		const velocities = dataBuffer.map(d => d.velocity);
		
		Plotly.restyle(chartDiv, {
			x: [positions],
			y: [velocities]
		}, 0);
	}
	
	function updateStripChart() {
		if (dataBuffer.length === 0) return;
		
		const times = dataBuffer.map(d => d.time);
		const positions = dataBuffer.map(d => d.position);
		
		Plotly.restyle(chartDiv, {
			x: [times],
			y: [positions]
		}, 0);
	}
</script>

<div class="chart-container">
	<div bind:this={chartDiv}></div>
</div>

<style>
	.chart-container {
		width: 100%;
		height: 100%;
	}
</style>