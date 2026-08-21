import { useEffect, useRef } from "react";
import { SimulationEngine } from "../simulation/SimulationEngine";
import type { WorldModel } from "../types";

export function SimulationCanvas({ world }: { world: WorldModel }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<SimulationEngine | null>(null);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const engine = new SimulationEngine(hostRef.current);
    engineRef.current = engine;
    engine.mount();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.reconstruct(world);
  }, [world]);

  return <div className="simulation-canvas" ref={hostRef} />;
}
