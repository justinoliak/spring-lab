<script lang="ts">
	// Control panel for physics parameters
	import { simulationStore } from '../stores/simulation';
	
	let mass = 1.0;
	let springConstant = 10.0;  // Less stiff spring for slower, smoother motion
	let damping = 0.0;          // No damping to see pure oscillations
	let mode = '1D';

	function updateParameters() {
		simulationStore.updateParams({
			m: mass,
			k: springConstant,
			c: damping,
			mode
		});
	}

	function reset() {
		simulationStore.reset();
	}
</script>

<div class="controls">
	<div class="control-group">
		<div class="control-header">
			<label for="mass">Mass (kg)</label>
			<span class="value">{mass}</span>
		</div>
		<input 
			id="mass"
			type="range" 
			min="0.1" 
			max="5.0" 
			step="0.01" 
			bind:value={mass}
			on:input={updateParameters}
		/>
	</div>

	<div class="control-group">
		<div class="control-header">
			<label for="spring">Spring Constant (N/m)</label>
			<span class="value">{springConstant}</span>
		</div>
		<input 
			id="spring"
			type="range" 
			min="1" 
			max="200" 
			step="0.1" 
			bind:value={springConstant}
			on:input={updateParameters}
		/>
	</div>

	<div class="control-group">
		<div class="control-header">
			<label for="damping">Damping (N⋅s/m)</label>
			<span class="value">{damping}</span>
		</div>
		<input 
			id="damping"
			type="range" 
			min="0" 
			max="50" 
			step="0.1" 
			bind:value={damping}
			on:input={updateParameters}
		/>
	</div>

</div>

<style>
	.controls {
		display: flex;
		flex-direction: column;
		gap: 15px;
	}

	.control-group {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.control-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	label {
		font-size: 12px;
		color: #333;
	}

	.value {
		font-family: monospace;
		font-size: 12px;
		padding: 2px 6px;
		background: #f0f0f0;
		border: 1px solid #ccc;
		min-width: 40px;
		text-align: center;
	}

	input[type="range"] {
		width: 100%;
	}

	select {
		padding: 6px;
		border: 1px solid #ccc;
		background: white;
		font-size: 12px;
	}

	.reset-btn {
		background: #f0f0f0;
		border: 1px solid #ccc;
		padding: 10px;
		cursor: pointer;
		font-size: 12px;
	}

	.reset-btn:hover {
		background: #e0e0e0;
	}
</style>