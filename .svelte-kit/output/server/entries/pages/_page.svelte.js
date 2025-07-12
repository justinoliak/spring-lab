import { c as create_ssr_component, b as add_attribute, a as subscribe, e as escape, v as validate_component } from "../../chunks/ssr.js";
import { w as writable } from "../../chunks/index.js";
import "katex";
const initialState = {
  position: { x: 1.2, y: 0 },
  // Start well above equilibrium for visible oscillation
  velocity: { x: 0, y: 0 },
  time: 0,
  initialPosition: { x: 1.2, y: 0 },
  // Track initial conditions for analytical calculations
  initialVelocity: { x: 0, y: 0 },
  params: {
    m: 1,
    k: 10,
    // Less stiff spring
    c: 0.5,
    // Light damping
    mode: "1D"
  },
  analytical: null,
  isRunning: false,
  worker: null
};
function createSimulationStore() {
  const { subscribe: subscribe2, set, update } = writable(initialState);
  return {
    subscribe: subscribe2,
    // Initialize web worker
    async init() {
      if (typeof window === "undefined") return;
      try {
        const worker = new Worker(
          new URL("../workers/simulation-worker.ts", import.meta.url),
          { type: "module" }
        );
        let messageCount = 0;
        worker.onmessage = (event) => {
          const data = event.data;
          messageCount++;
          if (messageCount % 120 === 0) {
            console.log("📨 Worker message", messageCount, data.type, data.position);
          }
          if (data.type === "analytical_updated") {
            update((state) => ({
              ...state,
              position: data.position,
              velocity: data.velocity,
              time: data.time,
              analytical: data.analytical
            }));
          } else {
            update((state) => ({
              ...state,
              position: data.position || state.position,
              velocity: data.velocity || state.velocity,
              time: data.time || state.time,
              analytical: data.analytical || state.analytical
            }));
          }
        };
        worker.onerror = (error) => {
          console.error("Worker error:", error);
        };
        update((state) => ({ ...state, worker }));
      } catch (error) {
        console.error("Failed to initialize simulation worker:", error);
      }
    },
    // Start simulation
    start() {
      update((state) => {
        console.log("📤 Starting simulation, worker:", !!state.worker);
        if (state.worker) {
          const message = {
            type: "start",
            params: state.params,
            initial: {
              x: state.initialPosition.x,
              y: state.initialPosition.y,
              vx: state.initialVelocity.x,
              vy: state.initialVelocity.y
            }
          };
          console.log("📤 Sending to worker:", message);
          state.worker.postMessage(message);
        } else {
          console.error("❌ No worker available");
        }
        return { ...state, isRunning: true };
      });
    },
    // Stop simulation
    stop() {
      update((state) => {
        if (state.worker) {
          state.worker.postMessage({ type: "stop" });
        }
        return { ...state, isRunning: false };
      });
    },
    // Reset simulation
    reset() {
      update((state) => {
        const initialPos = state.params.mode === "VECTOR" ? { x: 0.5, y: 1.5 } : { x: 1.2, y: 0 };
        const initialVel = { x: 0, y: 0 };
        if (state.worker) {
          state.worker.postMessage({ type: "stop" });
          state.worker.postMessage({
            type: "reset",
            params: state.params,
            initial: {
              x: initialPos.x,
              y: initialPos.y,
              vx: initialVel.x,
              vy: initialVel.y
            }
          });
        }
        return {
          ...state,
          position: initialPos,
          velocity: initialVel,
          initialPosition: initialPos,
          // Update tracked initial conditions
          initialVelocity: initialVel,
          time: 0,
          isRunning: false
          // Make sure it's paused after reset
        };
      });
    },
    // Update parameters
    updateParams(newParams) {
      update((state) => {
        const updatedParams = { ...state.params, ...newParams };
        let newPosition = state.position;
        let newVelocity = state.velocity;
        if (newParams.mode === "VECTOR" && state.params.mode !== "VECTOR") {
          const L0 = 1;
          const angle_deg = 20;
          const angle_rad = angle_deg * Math.PI / 180;
          newPosition = {
            x: L0 * Math.sin(angle_rad),
            // ≈ 0.342m horizontal
            y: L0 * Math.cos(angle_rad)
            // ≈ 0.940m vertical
          };
          newVelocity = { x: 0, y: 0 };
        } else if (newParams.mode === "1D" && state.params.mode !== "1D") {
          newPosition = { x: 1.2, y: 0 };
          newVelocity = { x: 0, y: 0 };
        }
        if (state.worker) {
          state.worker.postMessage({
            type: "update_params",
            params: updatedParams,
            initial: {
              x: newPosition.x,
              y: newPosition.y,
              vx: newVelocity.x,
              vy: newVelocity.y
            }
          });
        }
        return {
          ...state,
          params: updatedParams,
          position: newPosition,
          velocity: newVelocity,
          initialPosition: newPosition,
          // Update tracked initial conditions
          initialVelocity: newVelocity
        };
      });
    },
    // Set position (for dragging)
    setPosition(x, y) {
      update((state) => {
        const newPosition = { x, y };
        const newVelocity = { x: 0, y: 0 };
        if (state.worker) {
          state.worker.postMessage({
            type: "set_position",
            position: newPosition,
            initial: {
              x: newPosition.x,
              y: newPosition.y,
              vx: newVelocity.x,
              vy: newVelocity.y
            }
          });
        }
        return {
          ...state,
          position: newPosition,
          velocity: newVelocity,
          initialPosition: newPosition,
          // Update initial conditions when position is set
          initialVelocity: newVelocity,
          time: 0
          // Reset time when position is manually set
        };
      });
    }
  };
}
const simulationStore = createSimulationStore();
const css$3 = {
  code: ".canvas-container.svelte-cbcdlh{display:flex;justify-content:center;align-items:center}canvas.svelte-cbcdlh{border:1px solid #ddd;cursor:grab;background:#fff}canvas.svelte-cbcdlh:active{cursor:grabbing}",
  map: '{"version":3,"file":"SpringCanvas.svelte","sources":["SpringCanvas.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { onMount } from \\"svelte\\";\\nimport { simulationStore } from \\"../stores/simulation\\";\\nlet canvas;\\nlet ctx;\\nlet animationId;\\nonMount(() => {\\n  ctx = canvas.getContext(\\"2d\\");\\n  canvas.width = 500;\\n  canvas.height = 450;\\n  animate();\\n  canvas.addEventListener(\\"mousedown\\", handleMouseDown);\\n  canvas.addEventListener(\\"mousemove\\", handleMouseMove);\\n  canvas.addEventListener(\\"mouseup\\", handleMouseUp);\\n  document.addEventListener(\\"mousemove\\", handleMouseMove);\\n  document.addEventListener(\\"mouseup\\", handleMouseUp);\\n  return () => {\\n    if (animationId) cancelAnimationFrame(animationId);\\n    document.removeEventListener(\\"mousemove\\", handleMouseMove);\\n    document.removeEventListener(\\"mouseup\\", handleMouseUp);\\n  };\\n});\\nlet isDragging = false;\\nlet dragOffset = { x: 0, y: 0 };\\nfunction handleMouseDown(event) {\\n  console.log(\\"Mouse down detected\\");\\n  const rect = canvas.getBoundingClientRect();\\n  const mouseX = event.clientX - rect.left;\\n  const mouseY = event.clientY - rect.top;\\n  const centerX = canvas.width / 2;\\n  const centerY = canvas.height / 2;\\n  const springTop = 50;\\n  let massX, massY;\\n  if (currentMode === \\"VECTOR\\") {\\n    massX = centerX + currentPosition.x * 150;\\n    massY = springTop + currentPosition.y * 150;\\n  } else {\\n    massX = centerX;\\n    massY = centerY + (currentPosition.x - 1) * 150;\\n  }\\n  const distance = Math.sqrt((mouseX - massX) ** 2 + (mouseY - massY) ** 2);\\n  console.log(\\"Click distance from mass:\\", distance, \\"Mass at:\\", massX, massY);\\n  if (distance <= 30) {\\n    console.log(\\"Starting drag\\");\\n    isDragging = true;\\n    dragOffset = { x: mouseX - massX, y: mouseY - massY };\\n    simulationStore.stop();\\n  }\\n}\\nfunction handleMouseMove(event) {\\n  if (!isDragging) return;\\n  const rect = canvas.getBoundingClientRect();\\n  const mouseX = event.clientX - rect.left;\\n  const mouseY = event.clientY - rect.top;\\n  const massX = mouseX - dragOffset.x;\\n  const massY = mouseY - dragOffset.y;\\n  const centerX = canvas.width / 2;\\n  const centerY = canvas.height / 2;\\n  const springTop = 50;\\n  let newX, newY;\\n  if (currentMode === \\"VECTOR\\") {\\n    newX = (massX - centerX) / 150;\\n    newY = (massY - springTop) / 150;\\n    newX = Math.max(-2, Math.min(2, newX));\\n    newY = Math.max(0.1, Math.min(4, newY));\\n  } else {\\n    newX = 1 + (massY - centerY) / 150;\\n    newY = 0;\\n    newX = Math.max(0.1, Math.min(3, newX));\\n  }\\n  simulationStore.setPosition(newX, newY);\\n}\\nfunction handleMouseUp() {\\n  console.log(\\"Mouse up, isDragging:\\", isDragging);\\n  if (isDragging) {\\n    console.log(\\"Ending drag, starting simulation\\");\\n    isDragging = false;\\n    setTimeout(() => {\\n      simulationStore.start();\\n    }, 10);\\n  }\\n}\\nlet frameCount = 0;\\nfunction animate() {\\n  frameCount++;\\n  clear();\\n  drawSpring();\\n  drawMass();\\n  animationId = requestAnimationFrame(animate);\\n}\\nfunction clear() {\\n  ctx.clearRect(0, 0, canvas.width, canvas.height);\\n}\\nfunction drawSpring() {\\n  const springTop = 50;\\n  const centerX = canvas.width / 2;\\n  const centerY = canvas.height / 2;\\n  let massX, massY;\\n  if (currentMode === \\"VECTOR\\") {\\n    massX = centerX + currentPosition.x * 150;\\n    massY = springTop + currentPosition.y * 150;\\n    ctx.save();\\n    ctx.strokeStyle = \\"#ddd\\";\\n    ctx.lineWidth = 1;\\n    ctx.beginPath();\\n    ctx.moveTo(centerX - 150, springTop);\\n    ctx.lineTo(centerX + 150, springTop);\\n    ctx.moveTo(centerX, springTop);\\n    ctx.lineTo(centerX, springTop + 300);\\n    ctx.stroke();\\n    ctx.restore();\\n  } else {\\n    massX = centerX;\\n    massY = centerY + (currentPosition.x - 1) * 150;\\n  }\\n  frameSkip++;\\n  const positionChanged = Math.abs(currentPosition.x - lastPosition.x) > 0.01 || Math.abs(currentPosition.y - lastPosition.y) > 0.01;\\n  const shouldUpdate = !springPath || positionChanged || frameSkip > 3;\\n  if (shouldUpdate) {\\n    frameSkip = 0;\\n    lastPosition = { ...currentPosition };\\n    springPath = new Path2D();\\n    const springLength = Math.sqrt((massX - centerX) ** 2 + (massY - springTop) ** 2);\\n    const dx = massX - centerX;\\n    const dy = massY - springTop;\\n    if (springLength > 30) {\\n      const coils = 8;\\n      const coilRadius = 10;\\n      const segments = coils * 12;\\n      springPath.moveTo(centerX, springTop);\\n      for (let i = 1; i <= segments; i++) {\\n        const t = i / segments;\\n        const angle = t * coils * 2 * Math.PI;\\n        const axisX = centerX + dx * t;\\n        const axisY = springTop + dy * t;\\n        const offsetX = Math.cos(angle) * coilRadius;\\n        const offsetY = Math.sin(angle) * coilRadius * 0.3;\\n        springPath.lineTo(axisX + offsetX, axisY + offsetY);\\n      }\\n      springPath.lineTo(massX, massY);\\n    } else {\\n      springPath.moveTo(centerX, springTop);\\n      springPath.lineTo(massX, massY);\\n    }\\n  }\\n  ctx.strokeStyle = \\"#333\\";\\n  ctx.lineWidth = 1.5;\\n  ctx.lineCap = \\"round\\";\\n  ctx.stroke(springPath);\\n  ctx.fillStyle = \\"#333\\";\\n  ctx.fillRect(centerX - 40, springTop - 10, 80, 10);\\n  ctx.fillStyle = \\"#666\\";\\n  ctx.beginPath();\\n  ctx.arc(centerX - 20, springTop - 5, 3, 0, 2 * Math.PI);\\n  ctx.fill();\\n  ctx.beginPath();\\n  ctx.arc(centerX + 20, springTop - 5, 3, 0, 2 * Math.PI);\\n  ctx.fill();\\n}\\nlet currentPosition = { x: 0.2, y: 0 };\\nlet currentVelocity = { x: 0, y: 0 };\\nlet currentMode = \\"1D\\";\\nlet lastPosition = { x: 0, y: 0 };\\nlet springPath = null;\\nlet frameSkip = 0;\\nsimulationStore.subscribe((state) => {\\n  if (state.position) {\\n    currentPosition = state.position;\\n  }\\n  if (state.velocity) {\\n    currentVelocity = state.velocity;\\n  }\\n  if (state.params) {\\n    currentMode = state.params.mode;\\n  }\\n});\\nfunction drawMass() {\\n  const centerX = canvas.width / 2;\\n  const centerY = canvas.height / 2;\\n  const springTop = 50;\\n  let massX, massY;\\n  if (currentMode === \\"VECTOR\\") {\\n    massX = centerX + currentPosition.x * 150;\\n    massY = springTop + currentPosition.y * 150;\\n  } else {\\n    massX = centerX;\\n    massY = centerY + (currentPosition.x - 1) * 150;\\n  }\\n  const radius = 20;\\n  ctx.fillStyle = \\"#666\\";\\n  ctx.beginPath();\\n  ctx.arc(massX, massY, radius, 0, 2 * Math.PI);\\n  ctx.fill();\\n  ctx.strokeStyle = \\"#000\\";\\n  ctx.lineWidth = 2;\\n  ctx.stroke();\\n}\\n<\/script>\\n\\n<div class=\\"canvas-container\\">\\n\\t<canvas bind:this={canvas}></canvas>\\n</div>\\n\\n<style>\\n\\t.canvas-container {\\n\\t\\tdisplay: flex;\\n\\t\\tjustify-content: center;\\n\\t\\talign-items: center;\\n\\t}\\n\\n\\tcanvas {\\n\\t\\tborder: 1px solid #ddd;\\n\\t\\tcursor: grab;\\n\\t\\tbackground: #fff;\\n\\t}\\n\\n\\tcanvas:active {\\n\\t\\tcursor: grabbing;\\n\\t}\\n\\n</style>"],"names":[],"mappings":"AA2MC,+BAAkB,CACjB,OAAO,CAAE,IAAI,CACb,eAAe,CAAE,MAAM,CACvB,WAAW,CAAE,MACd,CAEA,oBAAO,CACN,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,IAAI,CACtB,MAAM,CAAE,IAAI,CACZ,UAAU,CAAE,IACb,CAEA,oBAAM,OAAQ,CACb,MAAM,CAAE,QACT"}'
};
const SpringCanvas = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let canvas;
  simulationStore.subscribe((state) => {
    if (state.position) {
      state.position;
    }
    if (state.velocity) {
      state.velocity;
    }
    if (state.params) {
      state.params.mode;
    }
  });
  $$result.css.add(css$3);
  return `<div class="canvas-container svelte-cbcdlh"><canvas class="svelte-cbcdlh"${add_attribute("this", canvas, 0)}></canvas> </div>`;
});
const css$2 = {
  code: ".chart-container.svelte-ivcd9i{width:100%;height:100%}",
  map: '{"version":3,"file":"PlotlyChart.svelte","sources":["PlotlyChart.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { onMount } from \\"svelte\\";\\nimport { simulationStore } from \\"../stores/simulation\\";\\nexport let type;\\nexport let mini = false;\\nlet chartDiv;\\nlet Plotly;\\nimport { chartDataStore, addDataPoint } from \\"../stores/chartData\\";\\nlet dataBuffer = [];\\nlet lastTime = -1;\\nlet updateCounter = 0;\\nonMount(async () => {\\n  Plotly = await import(\\"plotly.js-dist-min\\");\\n  initChart();\\n  const unsubscribeChart = chartDataStore.subscribe((data) => {\\n    dataBuffer = data;\\n    if (Plotly && chartDiv) {\\n      if (type === \\"phase\\") {\\n        updatePhasePortrait();\\n      } else {\\n        updateStripChart();\\n      }\\n    }\\n  });\\n  const unsubscribeSim = simulationStore.subscribe((data) => {\\n    updateChart(data);\\n  });\\n  return () => {\\n    unsubscribeChart();\\n    unsubscribeSim();\\n  };\\n});\\nfunction initChart() {\\n  if (!Plotly) return;\\n  if (type === \\"phase\\") {\\n    initPhasePortrait();\\n  } else {\\n    initStripChart();\\n  }\\n}\\nfunction initPhasePortrait() {\\n  const data = [{\\n    x: [],\\n    y: [],\\n    mode: \\"lines+markers\\",\\n    type: \\"scatter\\",\\n    name: \\"Phase Portrait\\",\\n    line: { color: \\"#007bff\\" },\\n    marker: { size: 3 }\\n  }];\\n  const layout = {\\n    title: \\"\\",\\n    xaxis: {\\n      title: mini ? \\"\\" : \\"Position (m)\\",\\n      range: [-3, 3],\\n      fixedrange: true,\\n      showticklabels: !mini\\n    },\\n    yaxis: {\\n      title: mini ? \\"\\" : \\"Velocity (m/s)\\",\\n      range: [-8, 8],\\n      fixedrange: true,\\n      showticklabels: !mini\\n    },\\n    margin: mini ? { l: 25, r: 12, t: 10, b: 25 } : { l: 60, r: 30, t: 30, b: 60 },\\n    height: mini ? 140 : 500\\n  };\\n  const config = {\\n    displayModeBar: false,\\n    responsive: true,\\n    staticPlot: false\\n  };\\n  Plotly.newPlot(chartDiv, data, layout, config);\\n}\\nfunction initStripChart() {\\n  const data = [{\\n    x: [],\\n    y: [],\\n    mode: \\"lines\\",\\n    type: \\"scatter\\",\\n    name: \\"Position\\",\\n    line: { color: \\"#28a745\\" }\\n  }];\\n  const layout = {\\n    title: \\"\\",\\n    xaxis: {\\n      title: mini ? \\"\\" : \\"Time (s)\\",\\n      range: [0, 15],\\n      fixedrange: true,\\n      showticklabels: !mini\\n    },\\n    yaxis: {\\n      title: mini ? \\"\\" : \\"Position (m)\\",\\n      range: [-3, 3],\\n      fixedrange: true,\\n      showticklabels: !mini\\n    },\\n    margin: mini ? { l: 25, r: 12, t: 10, b: 25 } : { l: 60, r: 30, t: 30, b: 60 },\\n    height: mini ? 140 : 500\\n  };\\n  const config = {\\n    displayModeBar: false,\\n    responsive: true,\\n    staticPlot: false\\n  };\\n  Plotly.newPlot(chartDiv, data, layout, config);\\n}\\nfunction updateChart(simData) {\\n  if (!Plotly || !chartDiv || !simData.position || !simData.velocity) return;\\n  const currentTime = simData.time || 0;\\n  updateCounter++;\\n  if (mini && updateCounter % 3 !== 0) return;\\n  lastTime = currentTime;\\n  const position = simData.params?.mode === \\"VECTOR\\" ? Math.hypot(simData.position.x, simData.position.y) - 1 : (\\n    // 2D: distance from equilibrium \\n    simData.position.x - 1\\n  );\\n  const velocity = simData.params?.mode === \\"VECTOR\\" ? Math.hypot(simData.velocity.x, simData.velocity.y) : (\\n    // 2D: magnitude\\n    simData.velocity.x\\n  );\\n  addDataPoint(currentTime, position, velocity);\\n}\\nfunction updatePhasePortrait() {\\n  if (dataBuffer.length === 0) return;\\n  const positions = dataBuffer.map((d) => d.position);\\n  const velocities = dataBuffer.map((d) => d.velocity);\\n  Plotly.restyle(chartDiv, {\\n    x: [positions],\\n    y: [velocities]\\n  }, 0);\\n}\\nfunction updateStripChart() {\\n  if (dataBuffer.length === 0) return;\\n  const times = dataBuffer.map((d) => d.time);\\n  const positions = dataBuffer.map((d) => d.position);\\n  Plotly.restyle(chartDiv, {\\n    x: [times],\\n    y: [positions]\\n  }, 0);\\n}\\n<\/script>\\n\\n<div class=\\"chart-container\\">\\n\\t<div bind:this={chartDiv}></div>\\n</div>\\n\\n<style>\\n\\t.chart-container {\\n\\t\\twidth: 100%;\\n\\t\\theight: 100%;\\n\\t}\\n</style>"],"names":[],"mappings":"AAmJC,8BAAiB,CAChB,KAAK,CAAE,IAAI,CACX,MAAM,CAAE,IACT"}'
};
const PlotlyChart = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { type } = $$props;
  let { mini = false } = $$props;
  let chartDiv;
  if ($$props.type === void 0 && $$bindings.type && type !== void 0) $$bindings.type(type);
  if ($$props.mini === void 0 && $$bindings.mini && mini !== void 0) $$bindings.mini(mini);
  $$result.css.add(css$2);
  return `<div class="chart-container svelte-ivcd9i"><div${add_attribute("this", chartDiv, 0)}></div> </div>`;
});
const css$1 = {
  code: ".math-equation.svelte-4wc18l{font-size:14px}",
  map: '{"version":3,"file":"MathEquation.svelte","sources":["MathEquation.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { onMount } from \\"svelte\\";\\nimport katex from \\"katex\\";\\nexport let equation;\\nexport let displayMode = false;\\nlet mathElement;\\nfunction renderMath() {\\n  if (mathElement && equation) {\\n    try {\\n      katex.render(equation, mathElement, {\\n        displayMode,\\n        throwOnError: false,\\n        strict: false\\n      });\\n    } catch (error) {\\n      console.error(\\"KaTeX rendering error:\\", error);\\n      mathElement.innerHTML = `<span style=\\"font-family: monospace;\\">${equation}</span>`;\\n    }\\n  }\\n}\\nonMount(() => {\\n  renderMath();\\n});\\n$: if (mathElement && equation) {\\n  renderMath();\\n}\\n<\/script>\\n\\n<div bind:this={mathElement} class=\\"math-equation\\"></div>\\n\\n<style>\\n\\t.math-equation {\\n\\t\\tfont-size: 14px;\\n\\t}\\n</style>"],"names":[],"mappings":"AA8BC,4BAAe,CACd,SAAS,CAAE,IACZ"}'
};
const MathEquation = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let { equation } = $$props;
  let { displayMode = false } = $$props;
  let mathElement;
  if ($$props.equation === void 0 && $$bindings.equation && equation !== void 0) $$bindings.equation(equation);
  if ($$props.displayMode === void 0 && $$bindings.displayMode && displayMode !== void 0) $$bindings.displayMode(displayMode);
  $$result.css.add(css$1);
  return `<div class="math-equation svelte-4wc18l"${add_attribute("this", mathElement, 0)}></div>`;
});
const css = {
  code: '.app.svelte-dx2k4j.svelte-dx2k4j{margin:0;padding:20px 0}header.svelte-dx2k4j.svelte-dx2k4j{text-align:center;margin-bottom:30px;padding:0 20px}h1.svelte-dx2k4j.svelte-dx2k4j{margin:0 0 10px 0;font-size:24px;font-weight:normal}header.svelte-dx2k4j p.svelte-dx2k4j{margin:0;font-size:14px;color:#666}.layout.svelte-dx2k4j.svelte-dx2k4j{display:grid;grid-template-columns:800px 600px;gap:30px;padding:0 20px}.sim-section.svelte-dx2k4j.svelte-dx2k4j{display:flex;flex-direction:column}.canvas-section.svelte-dx2k4j.svelte-dx2k4j{background:#fff;border:1px solid #ddd;padding:20px}.sim-header.svelte-dx2k4j.svelte-dx2k4j{margin-bottom:20px;padding-bottom:15px}.controls-row.svelte-dx2k4j.svelte-dx2k4j{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}.main-controls.svelte-dx2k4j.svelte-dx2k4j{display:flex;align-items:center;gap:15px}.main-controls.svelte-dx2k4j button.svelte-dx2k4j{padding:10px 18px;border:1px solid #ccc;background:#f5f5f5;cursor:pointer;font-size:13px;border-radius:4px}.main-controls.svelte-dx2k4j button.svelte-dx2k4j:hover{background:#e5e5e5}.physics-controls.svelte-dx2k4j.svelte-dx2k4j{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.inline-control.svelte-dx2k4j.svelte-dx2k4j{display:flex;align-items:center;gap:8px;font-size:12px}.inline-control.svelte-dx2k4j label.svelte-dx2k4j{font-weight:normal;color:#333;min-width:55px;text-align:right}.slider-container.svelte-dx2k4j.svelte-dx2k4j{position:relative;display:inline-block}.inline-control.svelte-dx2k4j input[type="range"].svelte-dx2k4j{width:90px}.critical-tick.svelte-dx2k4j.svelte-dx2k4j{position:absolute;top:50%;transform:translateX(-50%) translateY(-50%);width:3px;height:12px;background:#ff6b35;border-radius:1px;cursor:pointer;z-index:10;pointer-events:auto}.critical-tick.svelte-dx2k4j.svelte-dx2k4j:hover{background:#ff4500;width:4px;height:14px}.critical-checkbox.svelte-dx2k4j.svelte-dx2k4j{display:flex;align-items:center;gap:4px;margin-left:8px;font-size:11px;cursor:pointer}.critical-checkbox.svelte-dx2k4j input[type="checkbox"].svelte-dx2k4j{margin:0;width:12px;height:12px}.checkbox-label.svelte-dx2k4j.svelte-dx2k4j{color:#666;font-size:10px}.inline-control.svelte-dx2k4j .value.svelte-dx2k4j{font-family:monospace;background:#f0f0f0;padding:3px 8px;border:1px solid #ccc;border-radius:3px;min-width:40px;text-align:center;font-size:11px}.sim-content.svelte-dx2k4j.svelte-dx2k4j{display:flex;flex-direction:column;align-items:center;gap:15px}.instructions.svelte-dx2k4j.svelte-dx2k4j{font-size:13px;color:#666;font-style:italic;text-align:center;padding:8px 16px;background:#f8f8f8;border:1px solid #eee;border-radius:4px;max-width:400px}.canvas-wrapper.svelte-dx2k4j.svelte-dx2k4j{display:inline-block}.sim-bottom.svelte-dx2k4j.svelte-dx2k4j{display:flex;gap:20px;margin-top:20px;align-items:flex-start}.sim-charts.svelte-dx2k4j.svelte-dx2k4j{display:grid;grid-template-columns:1fr 1fr;gap:15px;flex:1}.mini-chart.svelte-dx2k4j.svelte-dx2k4j{background:#f8f8f8;border:1px solid #ddd;border-radius:4px;padding:8px;cursor:pointer;transition:background-color 0.2s;min-width:0}.mini-chart.svelte-dx2k4j.svelte-dx2k4j:hover{background:#f0f0f0}.mini-chart.svelte-dx2k4j h4.svelte-dx2k4j{margin:0 0 6px 0;font-size:11px;font-weight:normal;color:#333;text-align:center}.mini-chart-container.svelte-dx2k4j.svelte-dx2k4j{height:140px;width:100%;border:1px solid #eee;background:white;border-radius:3px}.expand-hint.svelte-dx2k4j.svelte-dx2k4j{font-size:10px;color:#666;text-align:center;margin-top:5px;font-style:italic}.modal-overlay.svelte-dx2k4j.svelte-dx2k4j{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0, 0, 0, 0.7);display:flex;justify-content:center;align-items:center;z-index:1000}.modal-content.svelte-dx2k4j.svelte-dx2k4j{background:white;border-radius:8px;box-shadow:0 4px 20px rgba(0, 0, 0, 0.3);width:90%;max-width:800px;max-height:90vh;overflow:hidden}.modal-header.svelte-dx2k4j.svelte-dx2k4j{display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid #eee}.modal-header.svelte-dx2k4j h3.svelte-dx2k4j{margin:0;font-size:18px;font-weight:normal}.close-btn.svelte-dx2k4j.svelte-dx2k4j{background:none;border:none;font-size:24px;cursor:pointer;padding:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%}.close-btn.svelte-dx2k4j.svelte-dx2k4j:hover{background:#f0f0f0}.modal-chart.svelte-dx2k4j.svelte-dx2k4j{padding:20px;height:600px}.mode-toggle.svelte-dx2k4j label.svelte-dx2k4j{display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer}.mode-toggle.svelte-dx2k4j input[type="checkbox"].svelte-dx2k4j{margin:0}.sidebar.svelte-dx2k4j.svelte-dx2k4j{display:flex;flex-direction:column;gap:20px}.card.svelte-dx2k4j.svelte-dx2k4j{background:#fff;border:1px solid #ddd;padding:15px}h2.svelte-dx2k4j.svelte-dx2k4j{margin:0 0 15px 0;font-size:16px;font-weight:normal;border-bottom:1px solid #eee;padding-bottom:8px}.equation-display.svelte-dx2k4j.svelte-dx2k4j{text-align:center;padding:15px;background:#f8f8f8;border:1px solid #eee;margin-bottom:15px}.analytical-display.svelte-dx2k4j.svelte-dx2k4j{margin-bottom:20px}.equation-display.svelte-dx2k4j.svelte-dx2k4j{background:#f8f8f8;border:1px solid #eee;padding:15px;text-align:center;margin-bottom:10px;border-radius:4px}.equation-with-values.svelte-dx2k4j.svelte-dx2k4j{background:#f8f8f8;border:1px solid #ddd;padding:12px;margin-bottom:15px;border-radius:4px}.equation-with-values.svelte-dx2k4j h4.svelte-dx2k4j{margin:0 0 10px 0;font-size:12px;font-weight:bold;color:#666;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #ddd;padding-bottom:6px}.equation-with-values.svelte-dx2k4j .equation-display.svelte-dx2k4j{margin-bottom:0;background:white;border:1px solid #ddd}.regime-header.svelte-dx2k4j.svelte-dx2k4j{display:flex;align-items:center;gap:12px;margin-bottom:15px;padding:8px 12px;background:#f0f0f0;border:1px solid #ddd;font-size:13px}.regime-name.svelte-dx2k4j.svelte-dx2k4j{font-weight:bold;color:#333;text-transform:capitalize}.damping-ratio.svelte-dx2k4j.svelte-dx2k4j{font-family:monospace;background:#e8e8e8;padding:2px 6px;border-radius:3px}.solution-equation.svelte-dx2k4j.svelte-dx2k4j{text-align:center;padding:15px;background:#f8f8f8;border:1px solid #eee;margin-bottom:15px}h3.svelte-dx2k4j.svelte-dx2k4j{margin:0 0 8px 0;font-size:14px;font-weight:normal;color:#333;border-bottom:1px solid #eee;padding-bottom:4px}@media(max-width: 768px){.layout.svelte-dx2k4j.svelte-dx2k4j{grid-template-columns:1fr}}',
  map: '{"version":3,"file":"+page.svelte","sources":["+page.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { onMount } from \\"svelte\\";\\nimport SpringCanvas from \\"../lib/components/SpringCanvas.svelte\\";\\nimport PlotlyChart from \\"../lib/components/PlotlyChart.svelte\\";\\nimport MathEquation from \\"../lib/components/MathEquation.svelte\\";\\nimport { simulationStore } from \\"../lib/stores/simulation\\";\\nconst equation1D = \\"m\\\\\\\\ddot{x} + c\\\\\\\\dot{x} + kx = mg\\";\\nconst equation2D = \\"m\\\\\\\\ddot{\\\\\\\\vec{r}} + c\\\\\\\\dot{r}\\\\\\\\hat{r} + k(r - L_0)\\\\\\\\hat{r} = m\\\\\\\\vec{g}\\";\\nconst underdampedSolution = \\"x(t) = e^{-\\\\\\\\zeta\\\\\\\\omega_n t}(A\\\\\\\\cos(\\\\\\\\omega_d t) + B\\\\\\\\sin(\\\\\\\\omega_d t))\\";\\nconst criticalSolution = \\"x(t) = e^{-\\\\\\\\omega_n t}(A + Bt)\\";\\nconst overdampedSolution = \\"x(t) = Ae^{r_1 t} + Be^{r_2 t}\\";\\nlet is2DMode = false;\\nfunction toggleMode() {\\n  const newMode = is2DMode ? \\"VECTOR\\" : \\"1D\\";\\n  simulationStore.updateParams({ mode: newMode });\\n}\\nlet chartModalOpen = false;\\nlet chartModalType = \\"phase\\";\\nfunction openChartModal(type) {\\n  chartModalType = type;\\n  chartModalOpen = true;\\n}\\nfunction closeChartModal() {\\n  chartModalOpen = false;\\n}\\nlet mass = 1;\\nlet springConstant = 10;\\nlet damping = 0.5;\\nlet useCriticalDamping = false;\\n$: criticalDamping = 2 * Math.sqrt(mass * springConstant);\\n$: if (useCriticalDamping) {\\n  damping = criticalDamping;\\n  updateParameters();\\n}\\n$: liveODE1D = `${mass.toFixed(1)}\\\\\\\\ddot{x} + ${damping.toFixed(1)}\\\\\\\\dot{x} + ${springConstant.toFixed(1)}x = ${(mass * 9.81).toFixed(1)}`;\\n$: currentR = $simulationStore.position ? Math.hypot($simulationStore.position.x, $simulationStore.position.y) : 1;\\n$: liveODE2D = `${mass.toFixed(1)}\\\\\\\\ddot{\\\\\\\\vec{r}} + ${damping.toFixed(1)}\\\\\\\\dot{r}\\\\\\\\hat{r} + ${springConstant.toFixed(1)}(${currentR.toFixed(2)} - 1.0)\\\\\\\\hat{r} = ${mass.toFixed(1)}\\\\\\\\vec{g}`;\\n$: equilibrium1D = 1 + mass * 9.81 / springConstant;\\n$: equilibrium2D = 1 + mass * 9.81 / springConstant;\\n$: x0 = $simulationStore.initialPosition ? $simulationStore.params?.mode === \\"VECTOR\\" ? (\\n  // 2D: displacement from equilibrium radius (r - r_eq)\\n  Math.hypot($simulationStore.initialPosition.x, $simulationStore.initialPosition.y) - equilibrium2D\\n) : (\\n  // 1D: displacement from equilibrium position\\n  $simulationStore.initialPosition.x - equilibrium1D\\n) : 0.2;\\n$: v0 = $simulationStore.initialVelocity && $simulationStore.params?.mode === \\"VECTOR\\" ? (\\n  // 2D: radial velocity component (v⃗ · r̂)\\n  (() => {\\n    const x = $simulationStore.initialPosition?.x || 0;\\n    const y = $simulationStore.initialPosition?.y || 0;\\n    const vx = $simulationStore.initialVelocity?.x || 0;\\n    const vy = $simulationStore.initialVelocity?.y || 0;\\n    const r = Math.hypot(x, y);\\n    return r > 1e-9 ? (vx * x + vy * y) / r : 0;\\n  })()\\n) : (\\n  // 1D: x velocity\\n  $simulationStore.initialVelocity?.x || 0\\n);\\n$: A = x0;\\n$: B = $simulationStore.analytical ? $simulationStore.analytical.case === \\"underdamped\\" ? (v0 + $simulationStore.analytical.zeta * $simulationStore.analytical.omega_n * x0) / $simulationStore.analytical.omega_d : v0 + $simulationStore.analytical.omega_n * x0 : 0;\\n$: liveSolutionUnderdamped = $simulationStore.analytical ? `x(t) = e^{-${$simulationStore.analytical.zeta?.toFixed(3) || \\"0.000\\"} \\\\\\\\cdot ${$simulationStore.analytical.omega_n?.toFixed(3) || \\"0.000\\"} t}(${A.toFixed(3)}\\\\\\\\cos(${$simulationStore.analytical.omega_d?.toFixed(3) || \\"0.000\\"} t) + ${B.toFixed(3)}\\\\\\\\sin(${$simulationStore.analytical.omega_d?.toFixed(3) || \\"0.000\\"} t))` : \\"\\";\\n$: liveSolutionCritical = $simulationStore.analytical ? `x(t) = e^{-${$simulationStore.analytical.omega_n?.toFixed(3) || \\"0.000\\"} t}(${A.toFixed(3)} + ${B.toFixed(3)}t)` : \\"\\";\\n$: liveSolutionOverdamped = $simulationStore.analytical ? `x(t) = ${A.toFixed(3)}e^{${$simulationStore.analytical.r1?.toFixed(3) || \\"0.000\\"} t} + ${B.toFixed(3)}e^{${$simulationStore.analytical.r2?.toFixed(3) || \\"0.000\\"} t}` : \\"\\";\\nlet updateTimeout;\\nfunction updateParameters() {\\n  clearTimeout(updateTimeout);\\n  updateTimeout = setTimeout(() => {\\n    simulationStore.updateParams({\\n      m: mass,\\n      k: springConstant,\\n      c: damping\\n    });\\n  }, 50);\\n}\\nonMount(async () => {\\n  console.log(\\"Initializing simulation store...\\");\\n  try {\\n    await simulationStore.init();\\n    console.log(\\"Simulation store initialized (paused)\\");\\n  } catch (error) {\\n    console.error(\\"Failed to initialize simulation store:\\", error);\\n  }\\n  function handleKeydown(event) {\\n    if (event.ctrlKey && event.shiftKey && event.key === \\"R\\") {\\n      event.preventDefault();\\n      console.log(\\"Emergency restart triggered via keyboard\\");\\n      restartSimulation();\\n    }\\n  }\\n  document.addEventListener(\\"keydown\\", handleKeydown);\\n  return () => {\\n    document.removeEventListener(\\"keydown\\", handleKeydown);\\n  };\\n});\\nfunction pauseSimulation() {\\n  simulationStore.stop();\\n}\\nlet isResetting = false;\\nasync function resetSimulation() {\\n  if (isResetting) return;\\n  console.log(\\"Hard reset button clicked\\");\\n  isResetting = true;\\n  try {\\n    simulationStore.stop();\\n    clearTimeout(updateTimeout);\\n    await new Promise((resolve) => setTimeout(resolve, 200));\\n    await simulationStore.init();\\n    await new Promise((resolve) => setTimeout(resolve, 100));\\n    simulationStore.updateParams({\\n      m: mass,\\n      k: springConstant,\\n      c: damping\\n    });\\n    await new Promise((resolve) => setTimeout(resolve, 100));\\n    simulationStore.reset();\\n  } catch (error) {\\n    console.error(\\"Failed to hard reset simulation:\\", error);\\n  } finally {\\n    isResetting = false;\\n  }\\n}\\nfunction restartSimulation() {\\n  console.log(\\"Restarting simulation\\");\\n  simulationStore.stop();\\n  clearTimeout(updateTimeout);\\n  setTimeout(async () => {\\n    try {\\n      await simulationStore.init();\\n      updateParameters();\\n    } catch (error) {\\n      console.error(\\"Failed to restart simulation:\\", error);\\n    }\\n  }, 500);\\n}\\n<\/script>\\n\\n<svelte:head>\\n\\t<title>Interactive Spring Sandbox</title>\\n\\t<meta name=\\"description\\" content=\\"Educational spring-mass physics simulation\\" />\\n</svelte:head>\\n\\n<main class=\\"app\\">\\n\\t<header>\\n\\t\\t<h1>Interactive Spring Sandbox</h1>\\n\\t\\t<p>Real-time physics simulation with analytical solutions</p>\\n\\t</header>\\n\\n\\t<div class=\\"layout\\">\\n\\t\\t<!-- Left column: Simulation -->\\n\\t\\t<section class=\\"sim-section\\">\\n\\t\\t\\t<div class=\\"canvas-section\\">\\n\\t\\t\\t\\t<div class=\\"sim-header\\">\\n\\t\\t\\t\\t\\t<div class=\\"controls-row\\">\\n\\t\\t\\t\\t\\t\\t<div class=\\"main-controls\\">\\n\\t\\t\\t\\t\\t\\t\\t<button on:click={pauseSimulation}>Pause</button>\\n\\t\\t\\t\\t\\t\\t\\t<button on:click={resetSimulation}>Reset</button>\\n\\t\\t\\t\\t\\t\\t\\t<div class=\\"mode-toggle\\">\\n\\t\\t\\t\\t\\t\\t\\t\\t<label>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t<input \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ttype=\\"checkbox\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tbind:checked={is2DMode}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ton:change={toggleMode}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t/>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t2D Mode\\n\\t\\t\\t\\t\\t\\t\\t\\t</label>\\n\\t\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t<div class=\\"physics-controls\\">\\n\\t\\t\\t\\t\\t\\t\\t<div class=\\"inline-control\\">\\n\\t\\t\\t\\t\\t\\t\\t\\t<label for=\\"mass\\">Mass</label>\\n\\t\\t\\t\\t\\t\\t\\t\\t<input \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tid=\\"mass\\"\\n\\t\\t\\t\\t\\t\\t\\t\\t\\ttype=\\"range\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tmin=\\"0.2\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tmax=\\"3.0\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tstep=\\"0.05\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tbind:value={mass}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\ton:input={updateParameters}\\n\\t\\t\\t\\t\\t\\t\\t\\t/>\\n\\t\\t\\t\\t\\t\\t\\t\\t<span class=\\"value\\">{mass.toFixed(2)}</span>\\n\\t\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t\\t<div class=\\"inline-control\\">\\n\\t\\t\\t\\t\\t\\t\\t\\t<label for=\\"spring\\">Spring</label>\\n\\t\\t\\t\\t\\t\\t\\t\\t<input \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tid=\\"spring\\"\\n\\t\\t\\t\\t\\t\\t\\t\\t\\ttype=\\"range\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tmin=\\"2\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tmax=\\"80\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tstep=\\"0.5\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\tbind:value={springConstant}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\ton:input={updateParameters}\\n\\t\\t\\t\\t\\t\\t\\t\\t/>\\n\\t\\t\\t\\t\\t\\t\\t\\t<span class=\\"value\\">{springConstant.toFixed(1)}</span>\\n\\t\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t\\t<div class=\\"inline-control\\">\\n\\t\\t\\t\\t\\t\\t\\t\\t<label for=\\"damping\\">Damping</label>\\n\\t\\t\\t\\t\\t\\t\\t\\t<div class=\\"slider-container\\">\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t<input \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tid=\\"damping\\"\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ttype=\\"range\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tmin=\\"0\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tmax=\\"25\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tstep=\\"0.1\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tbind:value={damping}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ton:input={updateParameters}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tdisabled={useCriticalDamping}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t/>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t{#if criticalDamping <= 25}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t<div \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tclass=\\"critical-tick\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tstyle=\\"left: {(criticalDamping / 25) * 100}%\\"\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ttitle=\\"Critical damping: {criticalDamping.toFixed(1)}\\"\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ton:click={() => { damping = criticalDamping; updateParameters(); }}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\t></div>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t{/if}\\n\\t\\t\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t\\t\\t<span class=\\"value\\">{damping.toFixed(1)}</span>\\n\\t\\t\\t\\t\\t\\t\\t\\t<label class=\\"critical-checkbox\\">\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t<input \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ttype=\\"checkbox\\" \\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\tbind:checked={useCriticalDamping}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t\\ton:change={() => { if (!useCriticalDamping) updateParameters(); }}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t/>\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t<span class=\\"checkbox-label\\">Critical</span>\\n\\t\\t\\t\\t\\t\\t\\t\\t</label>\\n\\t\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\n\\t\\t\\t\\t<div class=\\"sim-content\\">\\n\\t\\t\\t\\t\\t<div class=\\"canvas-wrapper\\">\\n\\t\\t\\t\\t\\t\\t<SpringCanvas />\\n\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t<div class=\\"instructions\\">\\n\\t\\t\\t\\t\\t\\tClick and drag the mass to set initial position, then release to start simulation\\n\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t</div>\\n\\n\\t\\t\\t\\t<!-- Mini charts -->\\n\\t\\t\\t\\t<div class=\\"sim-bottom\\">\\n\\t\\t\\t\\t\\t<div class=\\"sim-charts\\">\\n\\t\\t\\t\\t\\t\\t<div class=\\"mini-chart\\" on:click={() => openChartModal(\'phase\')}>\\n\\t\\t\\t\\t\\t\\t\\t<h4>Phase Portrait</h4>\\n\\t\\t\\t\\t\\t\\t\\t<div class=\\"mini-chart-container\\">\\n\\t\\t\\t\\t\\t\\t\\t\\t<PlotlyChart type=\\"phase\\" mini={true} />\\n\\t\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t\\t<div class=\\"expand-hint\\">Click to expand</div>\\n\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t<div class=\\"mini-chart\\" on:click={() => openChartModal(\'strip\')}>\\n\\t\\t\\t\\t\\t\\t\\t<h4>Time Series</h4>\\n\\t\\t\\t\\t\\t\\t\\t<div class=\\"mini-chart-container\\">\\n\\t\\t\\t\\t\\t\\t\\t\\t<PlotlyChart type=\\"strip\\" mini={true} />\\n\\t\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t\\t<div class=\\"expand-hint\\">Click to expand</div>\\n\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t</div>\\n\\t\\t\\t</div>\\n\\t\\t</section>\\n\\n\\t\\t<!-- Right sidebar: Live Equations -->\\n\\t\\t<section class=\\"sidebar\\">\\n\\t\\t\\t<div class=\\"card\\">\\n\\t\\t\\t\\t<h2>Live Equations</h2>\\n\\n\\t\\t\\t\\t<div class=\\"equation-display\\">\\n\\t\\t\\t\\t\\t{#if $simulationStore.params?.mode === \'1D\'}\\n\\t\\t\\t\\t\\t\\t<MathEquation equation={equation1D} displayMode={true} />\\n\\t\\t\\t\\t\\t{:else}\\n\\t\\t\\t\\t\\t\\t<MathEquation equation={equation2D} displayMode={true} />\\n\\t\\t\\t\\t\\t{/if}\\n\\t\\t\\t\\t</div>\\n\\n\\t\\t\\t\\t<!-- ODE with Current Values -->\\n\\t\\t\\t\\t<div class=\\"equation-with-values\\">\\n\\t\\t\\t\\t\\t<h4>ODE with Current Values</h4>\\n\\t\\t\\t\\t\\t<div class=\\"equation-display\\">\\n\\t\\t\\t\\t\\t\\t{#if $simulationStore.params?.mode === \'1D\'}\\n\\t\\t\\t\\t\\t\\t\\t<MathEquation equation={liveODE1D} displayMode={true} />\\n\\t\\t\\t\\t\\t\\t{:else}\\n\\t\\t\\t\\t\\t\\t\\t<MathEquation equation={liveODE2D} displayMode={true} />\\n\\t\\t\\t\\t\\t\\t{/if}\\n\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t{#if $simulationStore.analytical}\\n\\t\\t\\t\\t\\t<div class=\\"analytical-display\\">\\n\\t\\t\\t\\t\\t\\t<h3>Analytical Solution</h3>\\n\\t\\t\\t\\t\\t\\t<div class=\\"regime-header\\">\\n\\t\\t\\t\\t\\t\\t\\t<strong>Regime:</strong> \\n\\t\\t\\t\\t\\t\\t\\t<span class=\\"regime-name\\">{$simulationStore.analytical.case}</span>\\n\\t\\t\\t\\t\\t\\t\\t<span class=\\"damping-ratio\\">ζ = {$simulationStore.analytical?.zeta?.toFixed(3) || \'0.000\'}</span>\\n\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t\\n\\t\\t\\t\\t\\t\\t<div class=\\"solution-equation\\">\\n\\t\\t\\t\\t\\t\\t\\t{#if $simulationStore.analytical.case === \'underdamped\'}\\n\\t\\t\\t\\t\\t\\t\\t\\t<MathEquation equation={underdampedSolution} displayMode={true} />\\n\\t\\t\\t\\t\\t\\t\\t{:else if $simulationStore.analytical.case === \'critical\'}\\n\\t\\t\\t\\t\\t\\t\\t\\t<MathEquation equation={criticalSolution} displayMode={true} />\\n\\t\\t\\t\\t\\t\\t\\t{:else if $simulationStore.analytical.case === \'overdamped\'}\\n\\t\\t\\t\\t\\t\\t\\t\\t<MathEquation equation={overdampedSolution} displayMode={true} />\\n\\t\\t\\t\\t\\t\\t\\t{/if}\\n\\t\\t\\t\\t\\t\\t</div>\\n\\n\\t\\t\\t\\t\\t\\t<!-- Solution with Current Values -->\\n\\t\\t\\t\\t\\t\\t<div class=\\"equation-with-values\\">\\n\\t\\t\\t\\t\\t\\t\\t<h4>Solution with Current Values</h4>\\n\\t\\t\\t\\t\\t\\t\\t<div class=\\"equation-display\\">\\n\\t\\t\\t\\t\\t\\t\\t\\t{#if $simulationStore.analytical.case === \'underdamped\'}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t<MathEquation equation={liveSolutionUnderdamped} displayMode={true} />\\n\\t\\t\\t\\t\\t\\t\\t\\t{:else if $simulationStore.analytical.case === \'critical\'}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t<MathEquation equation={liveSolutionCritical} displayMode={true} />\\n\\t\\t\\t\\t\\t\\t\\t\\t{:else if $simulationStore.analytical.case === \'overdamped\'}\\n\\t\\t\\t\\t\\t\\t\\t\\t\\t<MathEquation equation={liveSolutionOverdamped} displayMode={true} />\\n\\t\\t\\t\\t\\t\\t\\t\\t{/if}\\n\\t\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t{/if}\\n\\t\\t\\t</div>\\n\\t\\t</section>\\n\\t</div>\\n\\n\\t<!-- Chart Modal -->\\n\\t{#if chartModalOpen}\\n\\t\\t<div class=\\"modal-overlay\\" on:click={closeChartModal}>\\n\\t\\t\\t<div class=\\"modal-content\\" on:click|stopPropagation>\\n\\t\\t\\t\\t<div class=\\"modal-header\\">\\n\\t\\t\\t\\t\\t<h3>{chartModalType === \'phase\' ? \'Phase Portrait\' : \'Time Series\'}</h3>\\n\\t\\t\\t\\t\\t<button class=\\"close-btn\\" on:click={closeChartModal}>×</button>\\n\\t\\t\\t\\t</div>\\n\\t\\t\\t\\t<div class=\\"modal-chart\\">\\n\\t\\t\\t\\t\\t<PlotlyChart type={chartModalType} mini={false} />\\n\\t\\t\\t\\t</div>\\n\\t\\t\\t</div>\\n\\t\\t</div>\\n\\t{/if}\\n</main>\\n\\n<style>\\n\\t.app {\\n\\t\\tmargin: 0;\\n\\t\\tpadding: 20px 0;\\n\\t}\\n\\n\\theader {\\n\\t\\ttext-align: center;\\n\\t\\tmargin-bottom: 30px;\\n\\t\\tpadding: 0 20px;\\n\\t}\\n\\n\\th1 {\\n\\t\\tmargin: 0 0 10px 0;\\n\\t\\tfont-size: 24px;\\n\\t\\tfont-weight: normal;\\n\\t}\\n\\n\\theader p {\\n\\t\\tmargin: 0;\\n\\t\\tfont-size: 14px;\\n\\t\\tcolor: #666;\\n\\t}\\n\\n\\t.layout {\\n\\t\\tdisplay: grid;\\n\\t\\tgrid-template-columns: 800px 600px;\\n\\t\\tgap: 30px;\\n\\t\\tpadding: 0 20px;\\n\\t}\\n\\n\\t.sim-section {\\n\\t\\tdisplay: flex;\\n\\t\\tflex-direction: column;\\n\\t}\\n\\n\\t.canvas-section {\\n\\t\\tbackground: #fff;\\n\\t\\tborder: 1px solid #ddd;\\n\\t\\tpadding: 20px;\\n\\t}\\n\\n\\t.sim-header {\\n\\t\\tmargin-bottom: 20px;\\n\\t\\tpadding-bottom: 15px;\\n\\t}\\n\\n\\t.controls-row {\\n\\t\\tdisplay: flex;\\n\\t\\tjustify-content: space-between;\\n\\t\\talign-items: center;\\n\\t\\tgap: 20px;\\n\\t\\tflex-wrap: wrap;\\n\\t}\\n\\n\\t.main-controls {\\n\\t\\tdisplay: flex;\\n\\t\\talign-items: center;\\n\\t\\tgap: 15px;\\n\\t}\\n\\n\\t.main-controls button {\\n\\t\\tpadding: 10px 18px;\\n\\t\\tborder: 1px solid #ccc;\\n\\t\\tbackground: #f5f5f5;\\n\\t\\tcursor: pointer;\\n\\t\\tfont-size: 13px;\\n\\t\\tborder-radius: 4px;\\n\\t}\\n\\n\\t.main-controls button:hover {\\n\\t\\tbackground: #e5e5e5;\\n\\t}\\n\\n\\t.physics-controls {\\n\\t\\tdisplay: flex;\\n\\t\\talign-items: center;\\n\\t\\tgap: 20px;\\n\\t\\tflex-wrap: wrap;\\n\\t}\\n\\n\\t.inline-control {\\n\\t\\tdisplay: flex;\\n\\t\\talign-items: center;\\n\\t\\tgap: 8px;\\n\\t\\tfont-size: 12px;\\n\\t}\\n\\n\\t.inline-control label {\\n\\t\\tfont-weight: normal;\\n\\t\\tcolor: #333;\\n\\t\\tmin-width: 55px;\\n\\t\\ttext-align: right;\\n\\t}\\n\\n\\t.slider-container {\\n\\t\\tposition: relative;\\n\\t\\tdisplay: inline-block;\\n\\t}\\n\\n\\t.inline-control input[type=\\"range\\"] {\\n\\t\\twidth: 90px;\\n\\t}\\n\\n\\t.critical-tick {\\n\\t\\tposition: absolute;\\n\\t\\ttop: 50%;\\n\\t\\ttransform: translateX(-50%) translateY(-50%);\\n\\t\\twidth: 3px;\\n\\t\\theight: 12px;\\n\\t\\tbackground: #ff6b35;\\n\\t\\tborder-radius: 1px;\\n\\t\\tcursor: pointer;\\n\\t\\tz-index: 10;\\n\\t\\tpointer-events: auto;\\n\\t}\\n\\n\\t.critical-tick:hover {\\n\\t\\tbackground: #ff4500;\\n\\t\\twidth: 4px;\\n\\t\\theight: 14px;\\n\\t}\\n\\n\\t.critical-checkbox {\\n\\t\\tdisplay: flex;\\n\\t\\talign-items: center;\\n\\t\\tgap: 4px;\\n\\t\\tmargin-left: 8px;\\n\\t\\tfont-size: 11px;\\n\\t\\tcursor: pointer;\\n\\t}\\n\\n\\t.critical-checkbox input[type=\\"checkbox\\"] {\\n\\t\\tmargin: 0;\\n\\t\\twidth: 12px;\\n\\t\\theight: 12px;\\n\\t}\\n\\n\\t.checkbox-label {\\n\\t\\tcolor: #666;\\n\\t\\tfont-size: 10px;\\n\\t}\\n\\n\\t.inline-control .value {\\n\\t\\tfont-family: monospace;\\n\\t\\tbackground: #f0f0f0;\\n\\t\\tpadding: 3px 8px;\\n\\t\\tborder: 1px solid #ccc;\\n\\t\\tborder-radius: 3px;\\n\\t\\tmin-width: 40px;\\n\\t\\ttext-align: center;\\n\\t\\tfont-size: 11px;\\n\\t}\\n\\n\\t.sim-content {\\n\\t\\tdisplay: flex;\\n\\t\\tflex-direction: column;\\n\\t\\talign-items: center;\\n\\t\\tgap: 15px;\\n\\t}\\n\\n\\t.instructions {\\n\\t\\tfont-size: 13px;\\n\\t\\tcolor: #666;\\n\\t\\tfont-style: italic;\\n\\t\\ttext-align: center;\\n\\t\\tpadding: 8px 16px;\\n\\t\\tbackground: #f8f8f8;\\n\\t\\tborder: 1px solid #eee;\\n\\t\\tborder-radius: 4px;\\n\\t\\tmax-width: 400px;\\n\\t}\\n\\n\\t.canvas-wrapper {\\n\\t\\tdisplay: inline-block;\\n\\t}\\n\\n\\t.sim-bottom {\\n\\t\\tdisplay: flex;\\n\\t\\tgap: 20px;\\n\\t\\tmargin-top: 20px;\\n\\t\\talign-items: flex-start;\\n\\t}\\n\\n\\t.sim-values {\\n\\t\\tdisplay: flex;\\n\\t\\tflex-direction: column;\\n\\t\\tgap: 15px;\\n\\t\\tmin-width: 200px;\\n\\t}\\n\\n\\t.sim-values .live-values {\\n\\t\\tbackground: #f8f8f8;\\n\\t\\tborder: 1px solid #ddd;\\n\\t\\tpadding: 12px;\\n\\t\\tborder-radius: 4px;\\n\\t}\\n\\n\\t.sim-values .live-values h3 {\\n\\t\\tmargin: 0 0 8px 0;\\n\\t\\tfont-size: 13px;\\n\\t\\tfont-weight: normal;\\n\\t\\tcolor: #333;\\n\\t\\tborder-bottom: 1px solid #ddd;\\n\\t\\tpadding-bottom: 4px;\\n\\t}\\n\\n\\t.sim-values .values {\\n\\t\\tfont-family: monospace;\\n\\t\\tfont-size: 11px;\\n\\t}\\n\\n\\t.sim-values .values p {\\n\\t\\tmargin: 4px 0;\\n\\t}\\n\\n\\t.sim-charts {\\n\\t\\tdisplay: grid;\\n\\t\\tgrid-template-columns: 1fr 1fr;\\n\\t\\tgap: 15px;\\n\\t\\tflex: 1;\\n\\t}\\n\\n\\t.mini-chart {\\n\\t\\tbackground: #f8f8f8;\\n\\t\\tborder: 1px solid #ddd;\\n\\t\\tborder-radius: 4px;\\n\\t\\tpadding: 8px;\\n\\t\\tcursor: pointer;\\n\\t\\ttransition: background-color 0.2s;\\n\\t\\tmin-width: 0;\\n\\t}\\n\\n\\t.mini-chart:hover {\\n\\t\\tbackground: #f0f0f0;\\n\\t}\\n\\n\\t.mini-chart h4 {\\n\\t\\tmargin: 0 0 6px 0;\\n\\t\\tfont-size: 11px;\\n\\t\\tfont-weight: normal;\\n\\t\\tcolor: #333;\\n\\t\\ttext-align: center;\\n\\t}\\n\\n\\t.mini-chart-container {\\n\\t\\theight: 140px;\\n\\t\\twidth: 100%;\\n\\t\\tborder: 1px solid #eee;\\n\\t\\tbackground: white;\\n\\t\\tborder-radius: 3px;\\n\\t}\\n\\n\\t.expand-hint {\\n\\t\\tfont-size: 10px;\\n\\t\\tcolor: #666;\\n\\t\\ttext-align: center;\\n\\t\\tmargin-top: 5px;\\n\\t\\tfont-style: italic;\\n\\t}\\n\\n\\t.modal-overlay {\\n\\t\\tposition: fixed;\\n\\t\\ttop: 0;\\n\\t\\tleft: 0;\\n\\t\\twidth: 100%;\\n\\t\\theight: 100%;\\n\\t\\tbackground: rgba(0, 0, 0, 0.7);\\n\\t\\tdisplay: flex;\\n\\t\\tjustify-content: center;\\n\\t\\talign-items: center;\\n\\t\\tz-index: 1000;\\n\\t}\\n\\n\\t.modal-content {\\n\\t\\tbackground: white;\\n\\t\\tborder-radius: 8px;\\n\\t\\tbox-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);\\n\\t\\twidth: 90%;\\n\\t\\tmax-width: 800px;\\n\\t\\tmax-height: 90vh;\\n\\t\\toverflow: hidden;\\n\\t}\\n\\n\\t.modal-header {\\n\\t\\tdisplay: flex;\\n\\t\\tjustify-content: space-between;\\n\\t\\talign-items: center;\\n\\t\\tpadding: 20px;\\n\\t\\tborder-bottom: 1px solid #eee;\\n\\t}\\n\\n\\t.modal-header h3 {\\n\\t\\tmargin: 0;\\n\\t\\tfont-size: 18px;\\n\\t\\tfont-weight: normal;\\n\\t}\\n\\n\\t.close-btn {\\n\\t\\tbackground: none;\\n\\t\\tborder: none;\\n\\t\\tfont-size: 24px;\\n\\t\\tcursor: pointer;\\n\\t\\tpadding: 0;\\n\\t\\twidth: 30px;\\n\\t\\theight: 30px;\\n\\t\\tdisplay: flex;\\n\\t\\talign-items: center;\\n\\t\\tjustify-content: center;\\n\\t\\tborder-radius: 50%;\\n\\t}\\n\\n\\t.close-btn:hover {\\n\\t\\tbackground: #f0f0f0;\\n\\t}\\n\\n\\t.modal-chart {\\n\\t\\tpadding: 20px;\\n\\t\\theight: 600px;\\n\\t}\\n\\n\\t.mode-toggle {}\\n\\n\\t.mode-toggle label {\\n\\t\\tdisplay: flex;\\n\\t\\talign-items: center;\\n\\t\\tgap: 6px;\\n\\t\\tfont-size: 13px;\\n\\t\\tcursor: pointer;\\n\\t}\\n\\n\\t.mode-toggle input[type=\\"checkbox\\"] {\\n\\t\\tmargin: 0;\\n\\t}\\n\\n\\n\\t.sidebar {\\n\\t\\tdisplay: flex;\\n\\t\\tflex-direction: column;\\n\\t\\tgap: 20px;\\n\\t}\\n\\n\\t.card {\\n\\t\\tbackground: #fff;\\n\\t\\tborder: 1px solid #ddd;\\n\\t\\tpadding: 15px;\\n\\t}\\n\\n\\th2 {\\n\\t\\tmargin: 0 0 15px 0;\\n\\t\\tfont-size: 16px;\\n\\t\\tfont-weight: normal;\\n\\t\\tborder-bottom: 1px solid #eee;\\n\\t\\tpadding-bottom: 8px;\\n\\t}\\n\\n\\t.equation-display {\\n\\t\\ttext-align: center;\\n\\t\\tpadding: 15px;\\n\\t\\tbackground: #f8f8f8;\\n\\t\\tborder: 1px solid #eee;\\n\\t\\tmargin-bottom: 15px;\\n\\t}\\n\\n\\t.parameter-display, .live-values, .analytical-display, .live-equations-section {\\n\\t\\tmargin-bottom: 20px;\\n\\t}\\n\\n\\t.live-values {\\n\\t\\tbackground: #f8f8f8;\\n\\t\\tborder: 1px solid #ddd;\\n\\t\\tpadding: 15px;\\n\\t\\tborder-radius: 4px;\\n\\t\\tmargin-bottom: 20px;\\n\\t}\\n\\n\\t.equation-display {\\n\\t\\tbackground: #f8f8f8;\\n\\t\\tborder: 1px solid #eee;\\n\\t\\tpadding: 15px;\\n\\t\\ttext-align: center;\\n\\t\\tmargin-bottom: 10px;\\n\\t\\tborder-radius: 4px;\\n\\t}\\n\\n\\t.equation-with-values {\\n\\t\\tbackground: #f8f8f8;\\n\\t\\tborder: 1px solid #ddd;\\n\\t\\tpadding: 12px;\\n\\t\\tmargin-bottom: 15px;\\n\\t\\tborder-radius: 4px;\\n\\t}\\n\\n\\t.equation-with-values h4 {\\n\\t\\tmargin: 0 0 10px 0;\\n\\t\\tfont-size: 12px;\\n\\t\\tfont-weight: bold;\\n\\t\\tcolor: #666;\\n\\t\\ttext-transform: uppercase;\\n\\t\\tletter-spacing: 0.5px;\\n\\t\\tborder-bottom: 1px solid #ddd;\\n\\t\\tpadding-bottom: 6px;\\n\\t}\\n\\n\\t.equation-with-values .equation-display {\\n\\t\\tmargin-bottom: 0;\\n\\t\\tbackground: white;\\n\\t\\tborder: 1px solid #ddd;\\n\\t}\\n\\n\\t.regime-header {\\n\\t\\tdisplay: flex;\\n\\t\\talign-items: center;\\n\\t\\tgap: 12px;\\n\\t\\tmargin-bottom: 15px;\\n\\t\\tpadding: 8px 12px;\\n\\t\\tbackground: #f0f0f0;\\n\\t\\tborder: 1px solid #ddd;\\n\\t\\tfont-size: 13px;\\n\\t}\\n\\n\\t.regime-name {\\n\\t\\tfont-weight: bold;\\n\\t\\tcolor: #333;\\n\\t\\ttext-transform: capitalize;\\n\\t}\\n\\n\\t.damping-ratio {\\n\\t\\tfont-family: monospace;\\n\\t\\tbackground: #e8e8e8;\\n\\t\\tpadding: 2px 6px;\\n\\t\\tborder-radius: 3px;\\n\\t}\\n\\n\\t.solution-equation {\\n\\t\\ttext-align: center;\\n\\t\\tpadding: 15px;\\n\\t\\tbackground: #f8f8f8;\\n\\t\\tborder: 1px solid #eee;\\n\\t\\tmargin-bottom: 15px;\\n\\t}\\n\\n\\t.parameter-grid {\\n\\t\\tdisplay: grid;\\n\\t\\tgrid-template-columns: 1fr;\\n\\t\\tgap: 6px;\\n\\t}\\n\\n\\t.param-row {\\n\\t\\tdisplay: flex;\\n\\t\\talign-items: center;\\n\\t\\tgap: 8px;\\n\\t\\tbackground: #f8f8f8;\\n\\t\\tpadding: 6px 10px;\\n\\t\\tborder: 1px solid #eee;\\n\\t}\\n\\n\\t.unit {\\n\\t\\tfont-size: 11px;\\n\\t\\tcolor: #666;\\n\\t\\tfont-style: italic;\\n\\t}\\n\\n\\th3 {\\n\\t\\tmargin: 0 0 8px 0;\\n\\t\\tfont-size: 14px;\\n\\t\\tfont-weight: normal;\\n\\t\\tcolor: #333;\\n\\t\\tborder-bottom: 1px solid #eee;\\n\\t\\tpadding-bottom: 4px;\\n\\t}\\n\\n\\n\\t.values {\\n\\t\\tfont-family: monospace;\\n\\t\\tfont-size: 12px;\\n\\t}\\n\\n\\t.values p {\\n\\t\\tmargin: 5px 0;\\n\\t}\\n\\n\\t@media (max-width: 768px) {\\n\\t\\t.layout {\\n\\t\\t\\tgrid-template-columns: 1fr;\\n\\t\\t}\\n\\t}\\n</style>"],"names":[],"mappings":"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"}'
};
const equation1D = "m\\ddot{x} + c\\dot{x} + kx = mg";
const equation2D = "m\\ddot{\\vec{r}} + c\\dot{r}\\hat{r} + k(r - L_0)\\hat{r} = m\\vec{g}";
const underdampedSolution = "x(t) = e^{-\\zeta\\omega_n t}(A\\cos(\\omega_d t) + B\\sin(\\omega_d t))";
const criticalSolution = "x(t) = e^{-\\omega_n t}(A + Bt)";
const overdampedSolution = "x(t) = Ae^{r_1 t} + Be^{r_2 t}";
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let criticalDamping;
  let liveODE1D;
  let currentR;
  let liveODE2D;
  let equilibrium1D;
  let equilibrium2D;
  let x0;
  let v0;
  let A;
  let B;
  let liveSolutionUnderdamped;
  let liveSolutionCritical;
  let liveSolutionOverdamped;
  let $simulationStore, $$unsubscribe_simulationStore;
  $$unsubscribe_simulationStore = subscribe(simulationStore, (value) => $simulationStore = value);
  let is2DMode = false;
  let mass = 1;
  let springConstant = 10;
  let damping = 0.5;
  let useCriticalDamping = false;
  $$result.css.add(css);
  criticalDamping = 2 * Math.sqrt(mass * springConstant);
  liveODE1D = `${mass.toFixed(1)}\\ddot{x} + ${damping.toFixed(1)}\\dot{x} + ${springConstant.toFixed(1)}x = ${(mass * 9.81).toFixed(1)}`;
  currentR = $simulationStore.position ? Math.hypot($simulationStore.position.x, $simulationStore.position.y) : 1;
  liveODE2D = `${mass.toFixed(1)}\\ddot{\\vec{r}} + ${damping.toFixed(1)}\\dot{r}\\hat{r} + ${springConstant.toFixed(1)}(${currentR.toFixed(2)} - 1.0)\\hat{r} = ${mass.toFixed(1)}\\vec{g}`;
  equilibrium1D = 1 + mass * 9.81 / springConstant;
  equilibrium2D = 1 + mass * 9.81 / springConstant;
  x0 = $simulationStore.initialPosition ? $simulationStore.params?.mode === "VECTOR" ? (
    // 2D: displacement from equilibrium radius (r - r_eq)
    Math.hypot($simulationStore.initialPosition.x, $simulationStore.initialPosition.y) - equilibrium2D
  ) : (
    // 1D: displacement from equilibrium position
    $simulationStore.initialPosition.x - equilibrium1D
  ) : 0.2;
  v0 = $simulationStore.initialVelocity && $simulationStore.params?.mode === "VECTOR" ? (
    // 2D: radial velocity component (v⃗ · r̂)
    (() => {
      const x = $simulationStore.initialPosition?.x || 0;
      const y = $simulationStore.initialPosition?.y || 0;
      const vx = $simulationStore.initialVelocity?.x || 0;
      const vy = $simulationStore.initialVelocity?.y || 0;
      const r = Math.hypot(x, y);
      return r > 1e-9 ? (vx * x + vy * y) / r : 0;
    })()
  ) : (
    // 1D: x velocity
    $simulationStore.initialVelocity?.x || 0
  );
  A = x0;
  B = $simulationStore.analytical ? $simulationStore.analytical.case === "underdamped" ? (v0 + $simulationStore.analytical.zeta * $simulationStore.analytical.omega_n * x0) / $simulationStore.analytical.omega_d : v0 + $simulationStore.analytical.omega_n * x0 : 0;
  liveSolutionUnderdamped = $simulationStore.analytical ? `x(t) = e^{-${$simulationStore.analytical.zeta?.toFixed(3) || "0.000"} \\cdot ${$simulationStore.analytical.omega_n?.toFixed(3) || "0.000"} t}(${A.toFixed(3)}\\cos(${$simulationStore.analytical.omega_d?.toFixed(3) || "0.000"} t) + ${B.toFixed(3)}\\sin(${$simulationStore.analytical.omega_d?.toFixed(3) || "0.000"} t))` : "";
  liveSolutionCritical = $simulationStore.analytical ? `x(t) = e^{-${$simulationStore.analytical.omega_n?.toFixed(3) || "0.000"} t}(${A.toFixed(3)} + ${B.toFixed(3)}t)` : "";
  liveSolutionOverdamped = $simulationStore.analytical ? `x(t) = ${A.toFixed(3)}e^{${$simulationStore.analytical.r1?.toFixed(3) || "0.000"} t} + ${B.toFixed(3)}e^{${$simulationStore.analytical.r2?.toFixed(3) || "0.000"} t}` : "";
  $$unsubscribe_simulationStore();
  return `${$$result.head += `<!-- HEAD_svelte-1498hq0_START -->${$$result.title = `<title>Interactive Spring Sandbox</title>`, ""}<meta name="description" content="Educational spring-mass physics simulation"><!-- HEAD_svelte-1498hq0_END -->`, ""} <main class="app svelte-dx2k4j"><header class="svelte-dx2k4j" data-svelte-h="svelte-oot13r"><h1 class="svelte-dx2k4j">Interactive Spring Sandbox</h1> <p class="svelte-dx2k4j">Real-time physics simulation with analytical solutions</p></header> <div class="layout svelte-dx2k4j"> <section class="sim-section svelte-dx2k4j"><div class="canvas-section svelte-dx2k4j"><div class="sim-header svelte-dx2k4j"><div class="controls-row svelte-dx2k4j"><div class="main-controls svelte-dx2k4j"><button class="svelte-dx2k4j" data-svelte-h="svelte-56f40z">Pause</button> <button class="svelte-dx2k4j" data-svelte-h="svelte-aeigzh">Reset</button> <div class="mode-toggle svelte-dx2k4j"><label class="svelte-dx2k4j"><input type="checkbox" class="svelte-dx2k4j"${add_attribute("checked", is2DMode, 1)}>
									2D Mode</label></div></div> <div class="physics-controls svelte-dx2k4j"><div class="inline-control svelte-dx2k4j"><label for="mass" class="svelte-dx2k4j" data-svelte-h="svelte-14stbk2">Mass</label> <input id="mass" type="range" min="0.2" max="3.0" step="0.05" class="svelte-dx2k4j"${add_attribute("value", mass, 0)}> <span class="value svelte-dx2k4j">${escape(mass.toFixed(2))}</span></div> <div class="inline-control svelte-dx2k4j"><label for="spring" class="svelte-dx2k4j" data-svelte-h="svelte-c0l1y2">Spring</label> <input id="spring" type="range" min="2" max="80" step="0.5" class="svelte-dx2k4j"${add_attribute("value", springConstant, 0)}> <span class="value svelte-dx2k4j">${escape(springConstant.toFixed(1))}</span></div> <div class="inline-control svelte-dx2k4j"><label for="damping" class="svelte-dx2k4j" data-svelte-h="svelte-1yg4zsq">Damping</label> <div class="slider-container svelte-dx2k4j"><input id="damping" type="range" min="0" max="25" step="0.1" ${""} class="svelte-dx2k4j"${add_attribute("value", damping, 0)}> ${criticalDamping <= 25 ? `<div class="critical-tick svelte-dx2k4j" style="${"left: " + escape(criticalDamping / 25 * 100, true) + "%"}" title="${"Critical damping: " + escape(criticalDamping.toFixed(1), true)}"></div>` : ``}</div> <span class="value svelte-dx2k4j">${escape(damping.toFixed(1))}</span> <label class="critical-checkbox svelte-dx2k4j"><input type="checkbox" class="svelte-dx2k4j"${add_attribute("checked", useCriticalDamping, 1)}> <span class="checkbox-label svelte-dx2k4j" data-svelte-h="svelte-g1cw4s">Critical</span></label></div></div></div></div> <div class="sim-content svelte-dx2k4j"><div class="canvas-wrapper svelte-dx2k4j">${validate_component(SpringCanvas, "SpringCanvas").$$render($$result, {}, {}, {})}</div> <div class="instructions svelte-dx2k4j" data-svelte-h="svelte-129f5u7">Click and drag the mass to set initial position, then release to start simulation</div></div>  <div class="sim-bottom svelte-dx2k4j"><div class="sim-charts svelte-dx2k4j"><div class="mini-chart svelte-dx2k4j"><h4 class="svelte-dx2k4j" data-svelte-h="svelte-1o9c1us">Phase Portrait</h4> <div class="mini-chart-container svelte-dx2k4j">${validate_component(PlotlyChart, "PlotlyChart").$$render($$result, { type: "phase", mini: true }, {}, {})}</div> <div class="expand-hint svelte-dx2k4j" data-svelte-h="svelte-tlomye">Click to expand</div></div> <div class="mini-chart svelte-dx2k4j"><h4 class="svelte-dx2k4j" data-svelte-h="svelte-19w9fuw">Time Series</h4> <div class="mini-chart-container svelte-dx2k4j">${validate_component(PlotlyChart, "PlotlyChart").$$render($$result, { type: "strip", mini: true }, {}, {})}</div> <div class="expand-hint svelte-dx2k4j" data-svelte-h="svelte-tlomye">Click to expand</div></div></div></div></div></section>  <section class="sidebar svelte-dx2k4j"><div class="card svelte-dx2k4j"><h2 class="svelte-dx2k4j" data-svelte-h="svelte-1m7zyrf">Live Equations</h2> <div class="equation-display svelte-dx2k4j">${$simulationStore.params?.mode === "1D" ? `${validate_component(MathEquation, "MathEquation").$$render($$result, { equation: equation1D, displayMode: true }, {}, {})}` : `${validate_component(MathEquation, "MathEquation").$$render($$result, { equation: equation2D, displayMode: true }, {}, {})}`}</div>  <div class="equation-with-values svelte-dx2k4j"><h4 class="svelte-dx2k4j" data-svelte-h="svelte-xrmpqf">ODE with Current Values</h4> <div class="equation-display svelte-dx2k4j">${$simulationStore.params?.mode === "1D" ? `${validate_component(MathEquation, "MathEquation").$$render($$result, { equation: liveODE1D, displayMode: true }, {}, {})}` : `${validate_component(MathEquation, "MathEquation").$$render($$result, { equation: liveODE2D, displayMode: true }, {}, {})}`}</div></div> ${$simulationStore.analytical ? `<div class="analytical-display svelte-dx2k4j"><h3 class="svelte-dx2k4j" data-svelte-h="svelte-1s4lqqp">Analytical Solution</h3> <div class="regime-header svelte-dx2k4j"><strong data-svelte-h="svelte-ds6zdn">Regime:</strong> <span class="regime-name svelte-dx2k4j">${escape($simulationStore.analytical.case)}</span> <span class="damping-ratio svelte-dx2k4j">ζ = ${escape($simulationStore.analytical?.zeta?.toFixed(3) || "0.000")}</span></div> <div class="solution-equation svelte-dx2k4j">${$simulationStore.analytical.case === "underdamped" ? `${validate_component(MathEquation, "MathEquation").$$render(
    $$result,
    {
      equation: underdampedSolution,
      displayMode: true
    },
    {},
    {}
  )}` : `${$simulationStore.analytical.case === "critical" ? `${validate_component(MathEquation, "MathEquation").$$render(
    $$result,
    {
      equation: criticalSolution,
      displayMode: true
    },
    {},
    {}
  )}` : `${$simulationStore.analytical.case === "overdamped" ? `${validate_component(MathEquation, "MathEquation").$$render(
    $$result,
    {
      equation: overdampedSolution,
      displayMode: true
    },
    {},
    {}
  )}` : ``}`}`}</div>  <div class="equation-with-values svelte-dx2k4j"><h4 class="svelte-dx2k4j" data-svelte-h="svelte-3tapfw">Solution with Current Values</h4> <div class="equation-display svelte-dx2k4j">${$simulationStore.analytical.case === "underdamped" ? `${validate_component(MathEquation, "MathEquation").$$render(
    $$result,
    {
      equation: liveSolutionUnderdamped,
      displayMode: true
    },
    {},
    {}
  )}` : `${$simulationStore.analytical.case === "critical" ? `${validate_component(MathEquation, "MathEquation").$$render(
    $$result,
    {
      equation: liveSolutionCritical,
      displayMode: true
    },
    {},
    {}
  )}` : `${$simulationStore.analytical.case === "overdamped" ? `${validate_component(MathEquation, "MathEquation").$$render(
    $$result,
    {
      equation: liveSolutionOverdamped,
      displayMode: true
    },
    {},
    {}
  )}` : ``}`}`}</div></div></div>` : ``}</div></section></div>  ${``} </main>`;
});
export {
  Page as default
};
