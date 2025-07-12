# physics.py – simple spring-mass physics engine
# Runs at 120Hz in Pyodide Web Worker

import math
from dataclasses import dataclass
from typing import Dict, Any

@dataclass
class SpringEngine:
    """Simple spring-mass system with RK4 integration."""
    
    # Parameters
    m: float = 1.0          # mass (kg)
    k: float = 10.0         # spring constant (N/m)
    c: float = 0.5          # damping coefficient (N·s/m)
    g: float = 9.81         # gravity (m/s²)
    L0: float = 1.0         # natural spring length (m)
    mode: str = "1D"        # "1D" or "VECTOR"
    
    # State (displacement from equilibrium)
    x: float = 0.2          # displacement from equilibrium position
    y: float = 0.0          # horizontal displacement (VECTOR mode only)
    vx: float = 0.0         # velocity x
    vy: float = 0.0         # velocity y
    t: float = 0.0          # time
    
    def step(self, dt: float = 1/120) -> Dict[str, Any]:
        """Advance one timestep with RK4 integration."""
        if self.mode == "1D":
            self._step_1d(dt)
        else:  # VECTOR
            self._step_2d(dt)
        
        return {
            "x": self.x, "y": self.y,
            "vx": self.vx, "vy": self.vy,
            "t": self.t
        }
    
    def _step_1d(self, dt: float):
        """1D spring RK4 integration. x represents displacement from equilibrium."""
        def force(x, v):
            return (-self.k * x - self.c * v) / self.m
        
        # RK4
        k1_v = force(self.x, self.vx)
        k1_x = self.vx
        
        k2_v = force(self.x + k1_x * dt/2, self.vx + k1_v * dt/2)
        k2_x = self.vx + k1_v * dt/2
        
        k3_v = force(self.x + k2_x * dt/2, self.vx + k2_v * dt/2)
        k3_x = self.vx + k2_v * dt/2
        
        k4_v = force(self.x + k3_x * dt, self.vx + k3_v * dt)
        k4_x = self.vx + k3_v * dt
        
        self.x += dt * (k1_x + 2*k2_x + 2*k3_x + k4_x) / 6
        self.vx += dt * (k1_v + 2*k2_v + 2*k3_v + k4_v) / 6
        self.t += dt
    
    def _step_2d(self, dt: float):
        """2D vector spring with gravity in Cartesian coordinates."""
        def forces(x, y, vx, vy):
            # Current radius from origin
            r = math.hypot(x, y)
            if r < 1e-9:
                ux, uy = 0.0, 1.0
            else:
                ux, uy = x/r, y/r
            
            # Spring force (radial, relative to natural length)
            F_spring = -self.k * (r - self.L0)
            # Radial damping only
            v_radial = vx*ux + vy*uy
            F_damp = -self.c * v_radial
            
            # Total forces: spring + damping in radial direction, gravity in y
            Fx = (F_spring + F_damp) * ux
            Fy = (F_spring + F_damp) * uy + self.m * self.g
            
            return Fx/self.m, Fy/self.m
        
        # RK4
        k1_ax, k1_ay = forces(self.x, self.y, self.vx, self.vy)
        k1_vx, k1_vy = self.vx, self.vy
        
        k2_ax, k2_ay = forces(self.x + k1_vx*dt/2, self.y + k1_vy*dt/2, 
                              self.vx + k1_ax*dt/2, self.vy + k1_ay*dt/2)
        k2_vx, k2_vy = self.vx + k1_ax*dt/2, self.vy + k1_ay*dt/2
        
        k3_ax, k3_ay = forces(self.x + k2_vx*dt/2, self.y + k2_vy*dt/2,
                              self.vx + k2_ax*dt/2, self.vy + k2_ay*dt/2)
        k3_vx, k3_vy = self.vx + k2_ax*dt/2, self.vy + k2_ay*dt/2
        
        k4_ax, k4_ay = forces(self.x + k3_vx*dt, self.y + k3_vy*dt,
                              self.vx + k3_ax*dt, self.vy + k3_ay*dt)
        k4_vx, k4_vy = self.vx + k3_ax*dt, self.vy + k3_ay*dt
        
        # Correct RK4 update formulas
        self.x += dt * (k1_vx + 2*k2_vx + 2*k3_vx + k4_vx) / 6
        self.y += dt * (k1_vy + 2*k2_vy + 2*k3_vy + k4_vy) / 6
        self.vx += dt * (k1_ax + 2*k2_ax + 2*k3_ax + k4_ax) / 6
        self.vy += dt * (k1_ay + 2*k2_ay + 2*k3_ay + k4_ay) / 6
        
        # Apply 20° constraint (temporarily disabled to see pure 2D motion)
        # angle = math.atan2(self.x, self.y)  # angle from vertical 
        # max_angle = math.radians(20)
        # if abs(angle) > max_angle:
        #     constrained_angle = max_angle if angle > 0 else -max_angle
        #     r = math.hypot(self.x, self.y)
        #     self.x = r * math.sin(constrained_angle)
        #     self.y = r * math.cos(constrained_angle)
        #     if (angle > 0 and self.vy > 0) or (angle < 0 and self.vy < 0):
        #         self.vy = 0.0
        
        self.t += dt
    
    def get_analytical_solution(self) -> Dict[str, Any]:
        """Get closed-form solution parameters for UI."""
        omega_n = math.sqrt(self.k / self.m)
        zeta = self.c / (2 * math.sqrt(self.k * self.m))
        
        # x and y are already displacement from equilibrium
        if self.mode == "1D":
            x0 = self.x  # already displacement from equilibrium
            v0 = self.vx
        else:
            # 2D: use radial displacement from equilibrium
            r_current = math.hypot(self.x, self.y)
            x0 = r_current  # radial displacement from equilibrium
            # Calculate radial velocity component (v⃗ · r̂)
            if r_current > 1e-9:
                v0 = (self.vx * self.x + self.vy * self.y) / r_current
            else:
                v0 = 0.0
        
        if zeta < 1.0:
            # Underdamped
            omega_d = omega_n * math.sqrt(1 - zeta**2)
            A = x0
            B = (v0 + zeta * omega_n * x0) / omega_d
            return {
                "case": "underdamped",
                "omega_n": omega_n,
                "omega_d": omega_d,
                "zeta": zeta,
                "A": A,
                "B": B
            }
        elif abs(zeta - 1.0) < 1e-9:
            # Critical
            A = x0
            B = v0 + omega_n * x0
            return {
                "case": "critical",
                "omega_n": omega_n,
                "zeta": zeta,
                "A": A,
                "B": B
            }
        else:
            # Overdamped
            sqrt_term = math.sqrt(zeta**2 - 1)
            r1 = -omega_n * (zeta - sqrt_term)
            r2 = -omega_n * (zeta + sqrt_term)
            det = r2 - r1
            A = (r2 * x0 - v0) / det
            B = (v0 - r1 * x0) / det
            return {
                "case": "overdamped",
                "omega_n": omega_n,
                "zeta": zeta,
                "r1": r1,
                "r2": r2,
                "A": A,
                "B": B
            }

# Test
if __name__ == "__main__":
    engine = SpringEngine(m=1.0, k=4.0, c=0.2)
    
    print("Testing spring engine...")
    for i in range(3):
        state = engine.step()
        print(f"Step {i}: x={state['x']:.3f}, vx={state['vx']:.3f}")
    
    analytical = engine.get_analytical_solution()
    print(f"Regime: {analytical['case']}")
    print(f"ζ={analytical['zeta']:.3f}, ωₙ={analytical['omega_n']:.3f}")