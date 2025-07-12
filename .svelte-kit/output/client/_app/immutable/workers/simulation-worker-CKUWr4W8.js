let o=null,r=!1,s=null;async function d(){if(!r)try{console.log("⏳ Loading Pyodide module...");const e=await import("./chunks/rae8sVci.js");console.log("✅ Pyodide module loaded, initializing..."),o=await e.loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.27.7/full/"}),console.log("✅ Pyodide initialized"),console.log("⏳ Loading physics module...");const t=await(await fetch("/src/lib/physics/physics.py")).text();o.runPython(t),console.log("✅ Physics module loaded"),console.log("⏳ Creating engine instance..."),o.runPython(`
# Create engine instance directly (no import needed since we defined it above)
engine = SpringEngine()
		`),console.log("✅ Engine instance created"),r=!0,console.log("✅ Pyodide simulation worker fully initialized"),console.log("⏳ Testing engine...");const i=o.runPython("engine.step()").toJs({dict_converter:Object.fromEntries});console.log("✅ Test physics step:",i),postMessage({type:"ready",message:"Pyodide physics engine ready",testResult:i})}catch(e){console.error("❌ Failed to initialize Pyodide worker:",e),postMessage({type:"error",message:`Failed to initialize physics engine: ${e.message}`}),r=!1,o=null}}let a=[],l=!1;self.onmessage=async function(e){const{type:n,...t}=e.data;if(console.log("Worker received message:",n,t),!r){if(a.push(e.data),!l){for(l=!0,console.log("Initializing Pyodide..."),await d();a.length>0;){const i=a.shift();await c(i)}l=!1}return}await c(e.data)};async function c(e){const{type:n,...t}=e;if(!o){console.error("❌ Pyodide not ready, isInitialized:",r),postMessage({type:"error",message:"Physics engine not ready"});return}try{switch(n){case"start":p(t.params,t.initial);break;case"stop":g();break;case"reset":u(t.params,t.initial);break;case"update_params":y(t.params,t.initial);break;case"set_position":m(t.position);break;default:console.warn("Unknown message type:",n)}}catch(i){console.error("Worker error:",i),postMessage({type:"error",message:i instanceof Error?i.message:"Unknown error"})}}function p(e,n){s&&clearInterval(s),o.runPython(`
engine.m = ${e.m}
engine.k = ${e.k}
engine.c = ${e.c}
engine.mode = "${e.mode}"
engine.x = ${n.x}
engine.y = ${n.y}
engine.vx = ${n.vx}
engine.vy = ${n.vy}
engine.t = 0.0
	`);const t=o.runPython("engine.get_analytical_solution()").toJs({dict_converter:Object.fromEntries});postMessage({type:"started",analytical:t}),s=setInterval(()=>{f()},1e3/120)}function g(){s&&(clearInterval(s),s=null),postMessage({type:"stopped"})}function u(e,n){g(),y(e,n)}function y(e,n){console.log("🔧 Updating parameters:",e),o.runPython(`
engine.m = ${e.m}
engine.k = ${e.k}  
engine.c = ${e.c}
engine.mode = "${e.mode}"
print(f"Engine mode set to: {engine.mode}")
	`),n&&(console.log("🔧 Setting initial conditions:",n),o.runPython(`
engine.x = ${n.x}
engine.y = ${n.y}
engine.vx = ${n.vx}
engine.vy = ${n.vy}
engine.t = 0.0
print(f"Initial position set to: x={engine.x}, y={engine.y}")
		`));const t=o.runPython("engine.get_analytical_solution()").toJs({dict_converter:Object.fromEntries});postMessage({type:"params_updated",analytical:t})}function m(e){o.runPython(`
engine.x = ${e.x}
engine.y = ${e.y}
engine.vx = 0.0
engine.vy = 0.0
engine.t = 0.0  # Reset time to 0
	`);const n=o.runPython("engine.get_analytical_solution()").toJs({dict_converter:Object.fromEntries});postMessage({type:"analytical_updated",analytical:n,position:{x:e.x,y:e.y},velocity:{x:0,y:0},time:0})}function f(){const e=o.runPython("engine.step()").toJs({dict_converter:Object.fromEntries}),n=Math.floor(e.t*120);n%120===0&&n>0&&console.log("🔬 Physics step:",{mode:e.mode,position:{x:e.x,y:e.y},velocity:{x:e.vx,y:e.vy},time:e.t}),postMessage({type:"step",position:{x:e.x,y:e.y},velocity:{x:e.vx,y:e.vy},time:e.t})}self.onerror=function(e){console.error("Worker error:",e),postMessage({type:"error",message:e.message||"Unknown worker error"})};
