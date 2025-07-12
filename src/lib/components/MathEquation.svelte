<script lang="ts">
	import { onMount } from 'svelte';
	import katex from 'katex';
	
	export let equation: string;
	export let displayMode: boolean = false;
	
	let mathElement: HTMLElement;
	
	function renderMath() {
		if (mathElement && equation) {
			try {
				katex.render(equation, mathElement, {
					displayMode,
					throwOnError: false,
					strict: false
				});
			} catch (error) {
				console.error('KaTeX rendering error:', error);
				// Fallback to plain text if KaTeX fails
				mathElement.innerHTML = `<span style="font-family: monospace;">${equation}</span>`;
			}
		}
	}
	
	onMount(() => {
		renderMath();
	});
	
	// Re-render when equation changes
	$: if (mathElement && equation) {
		renderMath();
	}
</script>

<div bind:this={mathElement} class="math-equation"></div>

<style>
	.math-equation {
		font-size: 14px;
	}
</style>