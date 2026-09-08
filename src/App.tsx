import { Compass, Cpu, Eye, Hammer, History, Layers3, Maximize2, Minimize2, Minus, Plus, Send, SlidersHorizontal, Sparkles, Waves } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { runBuilderCommand } from "./builder";
import { SimulationCanvas } from "./components/SimulationCanvas";
import type { ChatMessage, WorldModel } from "./types";
import { cloneWorld, worldPresets } from "./worlds";

const starterMessages: ChatMessage[] = [
  {
    id: "builder-start",
    role: "builder",
    content: "World builder online. Ask for a biome, structures, weather, time of day, terrain, water, or a full regeneration."
  }
];

const suggestions = [
  "create an empty modern city overrun by zombies",
  "turn on ray tracing bloom and lens flare",
  "use self-similar fractal blocks with more detail",
  "create a flooded dolomite spire landscape at sunset",
  "make it a volcanic night world with ember weather",
  "add three towers and a glowing portal",
  "raise mountains and add a river",
  "regenerate a dense forest world",
  "make it orbital with aurora weather"
];

export function App() {
  const [worlds, setWorlds] = useState(() => worldPresets.map(cloneWorld));
  const [activeId, setActiveId] = useState(worldPresets[0].id);
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const [draft, setDraft] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLElement | null>(null);

  const activeWorld = useMemo(
    () => worlds.find((world) => world.id === activeId) ?? worlds[0],
    [activeId, worlds]
  );
  const controlNote = activeWorld.landscapeStyle === "zombie-city"
    ? "Arrow keys move and turn through the city. Space fires with tracer, impact, and crosshair feedback."
    : activeWorld.landscapeStyle === "dolomite-spires"
      ? "W or Up paddles forward, S or Down slows/reverses, A/D or Left/Right rows into a slow turn."
      : "WASD or arrow keys move through the world. Space jumps when grounded; mouse look aims the view.";

  function updateActiveWorld(next: WorldModel) {
    setWorlds((current) => current.map((world) => (world.id === next.id ? next : world)));
  }

  function submitCommand(command: string) {
    const cleaned = command.trim();
    if (!cleaned) {
      return;
    }

    const result = runBuilderCommand(cleaned, activeWorld);
    updateActiveWorld(result.world);
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: "user", content: cleaned },
      { id: `builder-${Date.now()}`, role: "builder", content: result.message }
    ]);
    setDraft("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitCommand(draft);
  }

  function forkWorld() {
    const fork: WorldModel = {
      ...cloneWorld(activeWorld),
      id: `${activeWorld.id}-fork-${Date.now()}`,
      name: `${activeWorld.name} Fork`,
      history: [`Forked from ${activeWorld.name}`, ...activeWorld.history]
    };
    setWorlds((current) => [fork, ...current]);
    setActiveId(fork.id);
  }

  function patchActiveWorld(patch: Partial<WorldModel>) {
    updateActiveWorld({
      ...cloneWorld(activeWorld),
      ...patch,
      history: [`Adjusted recursive world controls`, ...activeWorld.history].slice(0, 8)
    });
  }

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === stageRef.current);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement === stageRef.current) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }

    stageRef.current?.requestFullscreen().catch(() => undefined);
  }

  return (
    <main className="app-shell">
      <aside className="world-panel" aria-label="World library">
        <div className="brand-row">
          <Layers3 size={26} aria-hidden="true" />
          <div>
            <h1>Simule</h1>
            <p>Realtime virtual world lab</p>
          </div>
        </div>

        <button className="primary-action" type="button" onClick={forkWorld}>
          <Sparkles size={18} aria-hidden="true" />
          Fork Active World
        </button>

        <div className="panel-section">
          <div className="section-title">
            <Compass size={16} aria-hidden="true" />
            Worlds
          </div>
          <div className="world-list">
            {worlds.map((world) => (
              <button
                className={`world-tile ${world.id === activeId ? "selected" : ""}`}
                key={world.id}
                type="button"
                onClick={() => setActiveId(world.id)}
              >
                <span>{world.name}</span>
                <small>{world.biome} / {world.weather}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="panel-section stats-grid">
          <Metric label="Biome" value={activeWorld.biome} />
          <Metric label="Time" value={activeWorld.timeOfDay} />
          <Metric label="Weather" value={activeWorld.weather} />
          <Metric label="Objects" value={String(activeWorld.entities.length)} />
          <Metric
            label="Matter"
            value={
              activeWorld.matterMode === "tetra-lattice"
                ? "tetra"
                : activeWorld.matterMode === "metaballs"
                  ? "metaballs"
                  : activeWorld.matterMode === "fractal-blocks"
                    ? "fractal"
                    : "smooth"
            }
          />
          <Metric label="Detail" value={`${activeWorld.fractalDepth} / ${activeWorld.minimumBlockSize.toFixed(2)}`} />
          <Metric label="Max Block" value={activeWorld.maximumBlockSize.toFixed(1)} />
          <Metric label="Render" value={activeWorld.renderQuality} />
          <Metric label="Atmosphere" value={`${Math.round(activeWorld.refractionLevel * 100)}%`} />
          <Metric label="Water" value={activeWorld.waterLevel.toFixed(1)} />
        </div>

        <div className="panel-section control-bank" aria-label="Recursive world controls">
          <div className="section-title">
            <SlidersHorizontal size={16} aria-hidden="true" />
            Recursion
          </div>
          <div className="range-control">
            <ControlLabel
              label="Iteration"
              onDecrease={() => patchActiveWorld({ fractalDepth: Math.max(2, activeWorld.fractalDepth - 1) })}
              onIncrease={() => patchActiveWorld({ fractalDepth: Math.min(8, activeWorld.fractalDepth + 1) })}
            />
            <input
              type="range"
              min="2"
              max="8"
              step="1"
              value={activeWorld.fractalDepth}
              onChange={(event) => patchActiveWorld({ fractalDepth: Number(event.target.value) })}
              onInput={(event) => patchActiveWorld({ fractalDepth: Number(event.currentTarget.value) })}
            />
          </div>
          <div className="range-control">
            <ControlLabel
              label="Max Block"
              onDecrease={() => patchActiveWorld({ maximumBlockSize: Math.max(3, activeWorld.maximumBlockSize - 0.75) })}
              onIncrease={() => patchActiveWorld({ maximumBlockSize: Math.min(14, activeWorld.maximumBlockSize + 0.75) })}
            />
            <input
              type="range"
              min="3"
              max="14"
              step="0.75"
              value={activeWorld.maximumBlockSize}
              onChange={(event) => patchActiveWorld({ maximumBlockSize: Number(event.target.value) })}
              onInput={(event) => patchActiveWorld({ maximumBlockSize: Number(event.currentTarget.value) })}
            />
          </div>
          <div className="range-control">
            <ControlLabel
              label="Min Block"
              onDecrease={() => patchActiveWorld({ minimumBlockSize: Math.max(0.75, activeWorld.minimumBlockSize - 0.25) })}
              onIncrease={() => patchActiveWorld({ minimumBlockSize: Math.min(4, activeWorld.minimumBlockSize + 0.25) })}
            />
            <input
              type="range"
              min="0.75"
              max="4"
              step="0.25"
              value={activeWorld.minimumBlockSize}
              onChange={(event) => patchActiveWorld({ minimumBlockSize: Number(event.target.value) })}
              onInput={(event) => patchActiveWorld({ minimumBlockSize: Number(event.currentTarget.value) })}
            />
          </div>
          <div className="render-toggle" role="group" aria-label="Render quality">
            <button
              className={activeWorld.renderQuality === "balanced" ? "selected" : ""}
              type="button"
              onClick={() => patchActiveWorld({ renderQuality: "balanced" })}
            >
              Balanced
            </button>
            <button
              className={activeWorld.renderQuality === "cinematic" ? "selected" : ""}
              type="button"
              onClick={() => patchActiveWorld({ renderQuality: "cinematic" })}
            >
              Cinematic
            </button>
          </div>
          <div className="range-control">
            <ControlLabel
              label="Atmosphere"
              onDecrease={() => patchActiveWorld({ refractionLevel: Math.max(0, activeWorld.refractionLevel - 0.1) })}
              onIncrease={() => patchActiveWorld({ refractionLevel: Math.min(1, activeWorld.refractionLevel + 0.1) })}
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={activeWorld.refractionLevel}
              onChange={(event) => patchActiveWorld({ refractionLevel: Number(event.target.value) })}
              onInput={(event) => patchActiveWorld({ refractionLevel: Number(event.currentTarget.value) })}
            />
          </div>
          <div className="range-control">
            <ControlLabel
              label="Water Level"
              onDecrease={() => patchActiveWorld({ waterLevel: Math.max(-8, activeWorld.waterLevel - 0.5) })}
              onIncrease={() => patchActiveWorld({ waterLevel: Math.min(6, activeWorld.waterLevel + 0.5) })}
            />
            <input
              type="range"
              min="-8"
              max="6"
              step="0.1"
              value={activeWorld.waterLevel}
              onChange={(event) => patchActiveWorld({ waterLevel: Number(event.target.value) })}
              onInput={(event) => patchActiveWorld({ waterLevel: Number(event.currentTarget.value) })}
            />
          </div>
        </div>
      </aside>

      <section className="sim-stage" aria-label="3D simulation stage" ref={stageRef}>
        <SimulationCanvas world={activeWorld} />
        <div className="stage-hud">
          <div>
            <strong>{activeWorld.name}</strong>
            <span>{activeWorld.biome} world / {activeWorld.entities.length} constructs</span>
          </div>
          <div className="stage-actions">
            <div className="hud-pill">
              <Waves size={16} aria-hidden="true" />
              Water {activeWorld.waterLevel.toFixed(1)}
            </div>
            <div className="hud-pill optional-hud">
              <Eye size={16} aria-hidden="true" />
              Click viewport
            </div>
            <button className="fullscreen-button" type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
              {isFullscreen ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </section>

      <aside className="ops-panel" aria-label="World builder chat">
        <div className="ops-header">
          <div>
            <h2>Builder Ops</h2>
            <p>Conversational reconstruction interface</p>
          </div>
          <Cpu size={24} aria-hidden="true" />
        </div>

        <div className="message-stream">
          {messages.map((message) => (
            <div className={`message ${message.role}`} key={message.id}>
              {message.content}
            </div>
          ))}
        </div>

        <div className="suggestion-grid" aria-label="Command suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => submitCommand(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>

        <form className="chat-form" onSubmit={handleSubmit}>
          <input
            aria-label="World builder command"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add portals, change biome, rebuild terrain..."
          />
          <button type="submit" aria-label="Send command">
            <Send size={18} aria-hidden="true" />
          </button>
        </form>

        <div className="history-panel">
          <div className="section-title">
            <History size={16} aria-hidden="true" />
            Reconstruction Log
          </div>
          <ol>
            {activeWorld.history.map((entry, index) => (
              <li key={`${entry}-${index}`}>{entry}</li>
            ))}
          </ol>
        </div>

        <div className="control-note">
          <Hammer size={16} aria-hidden="true" />
          {controlNote}
        </div>
      </aside>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ControlLabel({
  label,
  onDecrease,
  onIncrease
}: {
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <span className="control-label">
      <span>{label}</span>
      <span className="stepper-group">
        <button type="button" aria-label={`Decrease ${label}`} onClick={onDecrease}>
          <Minus size={14} aria-hidden="true" />
        </button>
        <button type="button" aria-label={`Increase ${label}`} onClick={onIncrease}>
          <Plus size={14} aria-hidden="true" />
        </button>
      </span>
    </span>
  );
}
