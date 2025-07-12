// UI state management store
import { writable } from 'svelte/store';

interface UIState {
	// Panel visibility
	showDerivation: boolean;
	showAdvancedControls: boolean;
	
	// Chart settings
	chartTimeWindow: number; // seconds
	maxPhasePoints: number;
	
	// Performance settings
	renderQuality: 'low' | 'medium' | 'high';
	updateRate: number; // Hz
}

const initialUIState: UIState = {
	showDerivation: false,
	showAdvancedControls: false,
	chartTimeWindow: 10,
	maxPhasePoints: 500,
	renderQuality: 'high',
	updateRate: 30
};

function createUIStore() {
	const { subscribe, set, update } = writable<UIState>(initialUIState);
	
	return {
		subscribe,
		
		toggleDerivation() {
			update(state => ({ ...state, showDerivation: !state.showDerivation }));
		},
		
		toggleAdvancedControls() {
			update(state => ({ ...state, showAdvancedControls: !state.showAdvancedControls }));
		},
		
		setChartTimeWindow(seconds: number) {
			update(state => ({ ...state, chartTimeWindow: seconds }));
		},
		
		setRenderQuality(quality: UIState['renderQuality']) {
			update(state => ({ ...state, renderQuality: quality }));
		},
		
		setUpdateRate(rate: number) {
			update(state => ({ ...state, updateRate: rate }));
		}
	};
}

export const uiStore = createUIStore();