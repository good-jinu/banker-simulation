import { useState } from "react";
import type { Messages } from "../../i18n/messages/index.ts";
import {
  constant,
  humanizeValue,
  operation,
  recipeAtPath,
  recipeLabel,
  replaceRecipeAtPath,
  value,
  type RecipeOperator,
  type RecipePath,
  type ValueRecipe,
} from "../market-recipe.ts";

export function RecipeField({
  m,
  label,
  value: recipe,
  names,
  onChange,
}: {
  m: Messages;
  label: string;
  value: ValueRecipe;
  names: readonly string[];
  onChange: (value: ValueRecipe) => void;
}) {
  const t = m.marketSim;
  const [selectedPath, setSelectedPath] = useState<RecipePath>([]);
  const [numberEntry, setNumberEntry] = useState<string | null>(null);
  const replaceSelected = (next: ValueRecipe): void =>
    onChange(replaceRecipeAtPath(recipe, selectedPath, next));
  const chooseOperator = (operatorName: RecipeOperator): void => {
    const selected = recipeAtPath(recipe, selectedPath);
    replaceSelected(
      selected.kind === "operation"
        ? { ...selected, operator: operatorName }
        : operation(operatorName, selected, constant(1)),
    );
    if (selected.kind !== "operation")
      setSelectedPath([...selectedPath, "right"]);
  };

  return (
    <div className="wide mk-recipe">
      <span className="mk-recipe-label">{label}</span>
      <RecipeSlots
        recipe={recipe}
        path={[]}
        selectedPath={selectedPath}
        onSelect={setSelectedPath}
      />
      <div className="mk-recipe-tray" aria-label={t.valueCards}>
        <small>{t.valueCards}</small>
        <div>
          {names.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => replaceSelected(value(name))}
            >
              {humanizeValue(name)}
            </button>
          ))}
          <button
            type="button"
            className="mk-number-card"
            onClick={() => setNumberEntry("")}
          >
            {t.numberCard}
          </button>
        </div>
        <small>{t.operatorCards}</small>
        <div>
          {(
            [
              ["add", "+"],
              ["subtract", "−"],
              ["multiply", "×"],
              ["divide", "÷"],
            ] as const
          ).map(([operatorName, labelText]) => (
            <button
              key={operatorName}
              type="button"
              onClick={() => chooseOperator(operatorName)}
            >
              {labelText}
            </button>
          ))}
        </div>
      </div>
      {numberEntry !== null && (
        <NumberKeypad
          m={m}
          value={numberEntry}
          onChange={setNumberEntry}
          onCancel={() => setNumberEntry(null)}
          onConfirm={() => {
            const number = Number(numberEntry);
            if (!Number.isFinite(number)) return;
            replaceSelected(constant(number));
            setNumberEntry(null);
          }}
        />
      )}
    </div>
  );
}

function NumberKeypad({
  m,
  value: entry,
  onChange,
  onCancel,
  onConfirm,
}: {
  m: Messages;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = m.marketSim;
  const push = (key: string): void => {
    if (key === ".") {
      if (entry.includes(".")) return;
      onChange(entry ? `${entry}.` : "0.");
      return;
    }
    onChange(entry === "0" ? key : `${entry}${key}`);
  };
  return (
    <div className="mk-keypad" role="dialog" aria-label={t.numberPadTitle}>
      <header>
        <strong>{t.numberPadTitle}</strong>
        <output>{entry || "0"}</output>
      </header>
      <div className="mk-keypad-grid">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((key) => (
          <button key={key} type="button" onClick={() => push(key)}>
            {key}
          </button>
        ))}
        <button
          type="button"
          aria-label={t.deleteDigit}
          onClick={() => onChange(entry.slice(0, -1))}
        >
          ←
        </button>
      </div>
      <footer>
        <button type="button" onClick={onCancel}>
          {t.cancel}
        </button>
        <button
          type="button"
          className="confirm"
          onClick={onConfirm}
          disabled={!entry || entry.endsWith(".")}
        >
          {t.done}
        </button>
      </footer>
    </div>
  );
}

function RecipeSlots({
  recipe,
  path,
  selectedPath,
  onSelect,
}: {
  recipe: ValueRecipe;
  path: RecipePath;
  selectedPath: RecipePath;
  onSelect: (path: RecipePath) => void;
}) {
  const selected =
    path.length === selectedPath.length &&
    path.every((part, index) => part === selectedPath[index]);
  if (recipe.kind !== "operation")
    return (
      <button
        type="button"
        className={`mk-recipe-slot${selected ? " selected" : ""}`}
        onClick={() => onSelect(path)}
      >
        {recipeLabel(recipe)}
      </button>
    );
  return (
    <span className="mk-recipe-operation">
      <RecipeSlots
        recipe={recipe.left}
        path={[...path, "left"]}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
      <button
        type="button"
        className={`mk-recipe-operator${selected ? " selected" : ""}`}
        onClick={() => onSelect(path)}
      >
        {
          { add: "+", subtract: "−", multiply: "×", divide: "÷" }[
            recipe.operator
          ]
        }
      </button>
      <RecipeSlots
        recipe={recipe.right}
        path={[...path, "right"]}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
    </span>
  );
}
