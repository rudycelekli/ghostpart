import { useMemo, useState } from "react";
import { ArrowDownToLine, Sparkles } from "lucide-react";
import { downloadFile } from "../lib/cad";
import {
  examplePlate,
  exampleSpacer,
  openScadFromConcept,
  parseExplicitConcept,
  stlFromConcept,
  validateConcept,
  type DesignConcept,
} from "../lib/design";
import {
  listLocalModels,
  requestDesignConcept,
  type LocalModel,
} from "../lib/localAi";
import { ConceptPreview } from "./ConceptPreview";

const fields = {
  plate: [
    ["width", "Width"],
    ["height", "Height"],
    ["thickness", "Thickness"],
    ["holeDiameter", "Hole diameter"],
    ["holeSpacing", "Hole center spacing"],
    ["cornerRadius", "Corner radius"],
  ],
  spacer: [
    ["outerDiameter", "Outer diameter"],
    ["innerDiameter", "Inner diameter"],
    ["thickness", "Thickness"],
  ],
} as const;

export function DesignStudio() {
  const [description, setDescription] = useState(
    "A 60 mm x 20 mm x 4 mm plate with two 5 mm holes 40 mm apart and 3 mm corner radius.",
  );
  const [concept, setConcept] = useState<DesignConcept>(examplePlate);
  const [source, setSource] = useState("Example template");
  const [error, setError] = useState("");
  const [models, setModels] = useState<LocalModel[]>([]);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const issue = useMemo(() => {
    try {
      validateConcept(concept);
      return "";
    } catch (problem) {
      return problem instanceof Error ? problem.message : "Invalid dimensions.";
    }
  }, [concept]);

  const chooseTemplate = (next: DesignConcept) => {
    setConcept({ ...next });
    setSource("Example template · edit every measurement");
    setError("");
  };

  const interpret = () => {
    try {
      setConcept(parseExplicitConcept(description));
      setSource("Parsed from explicit dimensions");
      setError("");
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not parse the description.",
      );
    }
  };

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const found = await listLocalModels();
      if (!found.length) throw new Error("Ollama has no models installed.");
      setModels(found);
      setModel(found[0].name);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not connect to Ollama.",
      );
    } finally {
      setBusy(false);
    }
  };

  const interpretWithAi = async () => {
    setBusy(true);
    setError("");
    try {
      const next = await requestDesignConcept({ model, description });
      setConcept(next);
      setSource(`Local AI draft · ${model} · review all values`);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "AI could not make a draft.",
      );
    } finally {
      setBusy(false);
    }
  };

  const edit = (key: string, value: number) => {
    setConcept((current) => ({ ...current, [key]: value }) as DesignConcept);
    setSource("Manually edited draft");
  };

  return (
    <section className="design-section" id="describe-to-3d">
      <div className="section-heading">
        <div>
          <div className="eyebrow">DESCRIPTION → EDITABLE 3D</div>
          <h2>Say what you need. Inspect every millimetre.</h2>
        </div>
        <p>
          Turn a dimensioned description into printable CAD. This draft is
          separate from the measured repair above.
        </p>
      </div>
      <div className="design-workspace">
        <div className="design-inputs">
          <label htmlFor="design-description">
            Describe a flat plate or ring spacer, with every dimension in mm.
          </label>
          <textarea
            id="design-description"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="design-actions">
            <button onClick={interpret}>Build from dimensions</button>
            <button onClick={() => chooseTemplate(examplePlate)}>
              Plate example
            </button>
            <button onClick={() => chooseTemplate(exampleSpacer)}>
              Spacer example
            </button>
          </div>
          <div className="design-ai-row">
            {models.length ? (
              <>
                <select
                  aria-label="3D draft local model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                >
                  {models.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy || !description.trim()}
                  onClick={interpretWithAi}
                >
                  <Sparkles size={16} />{" "}
                  {busy ? "Thinking…" : "Interpret with local AI"}
                </button>
              </>
            ) : (
              <button disabled={busy} onClick={connect}>
                {busy ? "Connecting…" : "Connect Ollama for freer descriptions"}
              </button>
            )}
          </div>
          <p className="design-hint">
            AI may classify the shape, but an invented dimension is rejected. No
            photo or text leaves your device except to your own Ollama instance
            at 127.0.0.1.
          </p>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="design-output">
          <div className="design-status">
            <span>UNVERIFIED DESIGN DRAFT</span>
            <strong>{source}</strong>
          </div>
          {issue ? (
            <div className="design-placeholder">{issue}</div>
          ) : (
            <ConceptPreview concept={concept} />
          )}
          <div className="design-kind" role="group" aria-label="Part shape">
            <button
              aria-pressed={concept.kind === "plate"}
              onClick={() => chooseTemplate(examplePlate)}
            >
              Flat plate
            </button>
            <button
              aria-pressed={concept.kind === "spacer"}
              onClick={() => chooseTemplate(exampleSpacer)}
            >
              Ring spacer
            </button>
          </div>
          <div className="design-fields">
            {fields[concept.kind].map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <span>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={concept[key as keyof typeof concept] as number}
                    onChange={(event) => edit(key, Number(event.target.value))}
                  />{" "}
                  mm
                </span>
              </label>
            ))}
          </div>
          <div className="design-exports">
            <button
              disabled={!!issue}
              onClick={() =>
                downloadFile(
                  "ghostpart-concept.stl",
                  stlFromConcept(concept),
                  "model/stl",
                )
              }
            >
              <ArrowDownToLine size={16} /> Draft STL
            </button>
            <button
              disabled={!!issue}
              onClick={() =>
                downloadFile(
                  "ghostpart-concept.scad",
                  openScadFromConcept(concept),
                  "text/plain",
                )
              }
            >
              Editable OpenSCAD
            </button>
          </div>
          <p className="design-hint">
            Dimensions here are description or template values, not
            measurements. Check with calipers and test fit before using a print.
            The measured repair export above remains independent.
          </p>
        </div>
      </div>
    </section>
  );
}
