// Shared chart data store to sync between mini and modal charts
import { writable } from 'svelte/store';

export interface ChartDataPoint {
	time: number;
	position: number;
	velocity: number;
}

// Shared data buffer for all chart instances
export const chartDataStore = writable<ChartDataPoint[]>([]);

let lastDataTime = -1;

export function addDataPoint(time: number, position: number, velocity: number) {
	chartDataStore.update(data => {
		// Clear data when time jumps back to 0 or close to 0 (new simulation start)
		if (time < 0.1 && lastDataTime > 0.1) {
			lastDataTime = time;
			return [{ time, position, velocity }];
		}
		
		lastDataTime = time;
		// Add new data point
		return [...data, { time, position, velocity }];
	});
}

export function clearData() {
	chartDataStore.set([]);
}