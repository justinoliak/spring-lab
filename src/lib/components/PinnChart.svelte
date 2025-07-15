<script lang="ts">
	import { onMount } from 'svelte';
	import { chartDataStore } from '../stores/chartData';
	
	export let trainingData: any[] = [];
	export let predictions: any[] = [];
	export let isTraining: boolean = false;
	export let epoch: number = 0;
	export let mass: number = 1.0;
	export let springConstant: number = 10.0;
	
	let plotContainer: HTMLDivElement;
	let Plotly: any;
	let plotInitialized = false;
	
	onMount(async () => {
		// Load Plotly
		Plotly = await import('plotly.js-dist-min');
		
		// Initial plot
		updatePlot();
		
		// Subscribe to chart data updates
		const unsubscribe = chartDataStore.subscribe(() => {
			updatePlot();
		});
		
		return unsubscribe;
	});
	
	// Update plot when training data or predictions change
	$: if (Plotly && plotContainer) {
		console.log('PinnChart reactive update triggered:', {
			trainingDataLength: trainingData.length,
			predictionsLength: predictions.length,
			epoch,
			isTraining
		});
		updatePlot();
	}
	
	function updatePlot() {
		if (!Plotly || !plotContainer) return;
		
		const simulationData = $chartDataStore;
		const traces = [];
		
		// Main simulation data (time series) - convert to displacement from equilibrium
		if (simulationData.length > 0) {
			// The simulation data position is already displacement from equilibrium (0-centered)
			// No conversion needed - simulation data should oscillate around 0
			
			traces.push({
				x: simulationData.map(d => d.time),
				y: simulationData.map(d => d.position), // Already displacement from equilibrium
				type: 'scatter',
				mode: 'lines',
				name: 'Simulation Data',
				line: { color: '#1f77b4', width: 2 }
			});
		}
		
		// Training data points (scatter dots) - already in displacement from equilibrium
		if (trainingData.length > 0) {
			traces.push({
				x: trainingData.map(d => d.time),
				y: trainingData.map(d => d.position), // Already displacement from equilibrium
				type: 'scatter',
				mode: 'markers',
				name: 'Training Points',
				marker: { 
					color: '#ff7f0e', 
					size: 8, 
					symbol: 'circle',
					line: { color: '#000', width: 1 }
				}
			});
		}
		
		// PINN predictions (if training) - already in displacement from equilibrium
		if (predictions.length > 0) {
			console.log('Adding PINN predictions trace:', predictions.length, 'points');
			console.log('First few predictions:', predictions.slice(0, 3));
			
			traces.push({
				x: predictions.map(d => d.time),
				y: predictions.map(d => d.position), // Already displacement from equilibrium
				type: 'scatter',
				mode: 'lines',
				name: `PINN Prediction (Epoch ${epoch})`,
				line: { 
					color: '#ff0000', 
					width: 3
				}
			});
		}
		
		const layout = {
			title: 'PINN Training - Time Series',
			xaxis: { 
				title: 'Time (s)',
				gridcolor: '#e0e0e0'
			},
			yaxis: { 
				title: 'Displacement from Equilibrium (m)',
				gridcolor: '#e0e0e0'
			},
			plot_bgcolor: 'white',
			paper_bgcolor: 'white',
			margin: { l: 60, r: 20, t: 40, b: 60 },
			showlegend: true,
			legend: {
				x: 0.7,
				y: 1,
				bgcolor: 'rgba(255,255,255,0.8)',
				bordercolor: '#ccc',
				borderwidth: 1
			}
		};
		
		const config = {
			responsive: true,
			displayModeBar: false
		};
		
		console.log('Plotly.newPlot called with', traces.length, 'traces');
		
		if (!plotInitialized) {
			Plotly.newPlot(plotContainer, traces, layout, config);
			plotInitialized = true;
		} else {
			Plotly.react(plotContainer, traces, layout, config);
		}
	}
</script>

<div bind:this={plotContainer} class="pinn-chart"></div>

<style>
	.pinn-chart {
		width: 100%;
		height: 100%;
		min-height: 400px;
	}
</style>