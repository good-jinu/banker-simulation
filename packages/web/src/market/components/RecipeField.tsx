import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
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
  const [pickerPosition, setPickerPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const replaceSelected = (next: ValueRecipe): void =>
    onChange(replaceRecipeAtPath(recipe, selectedPath, next));
  const closePicker = (): void => setPickerPosition(null);
  const openPicker = (path: RecipePath, trigger: HTMLButtonElement): void => {
    setSelectedPath(path);
    const bounds = trigger.getBoundingClientRect();
    const pickerHeight = 238;
    const spaceBelow = window.innerHeight - bounds.bottom;
    setPickerPosition({
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - 268)),
      top:
        spaceBelow >= pickerHeight
          ? bounds.bottom + 8
          : Math.max(8, bounds.top - pickerHeight - 8),
    });
  };
  const chooseOperator = (operatorName: RecipeOperator): void => {
    const selected = recipeAtPath(recipe, selectedPath);
    // Operators describe an existing operation; adding a new operation is
    // deliberately reserved for the expression's + control below.
    if (selected.kind !== "operation") return;
    replaceSelected({ ...selected, operator: operatorName });
  };
  const choosePickerItem = (item: string): void => {
    closePicker();
    if (item === "number") {
      setNumberEntry("");
      return;
    }
    if (item.startsWith("value:")) {
      replaceSelected(value(item.slice("value:".length)));
      return;
    }
    if (item.startsWith("operator:")) {
      chooseOperator(item.slice("operator:".length) as RecipeOperator);
    }
  };
  const appendFormula = (trigger: HTMLButtonElement): void => {
    onChange(operation("add", recipe, constant(1)));
    openPicker(["right"], trigger);
  };
  const removeFormulaPart = (path: RecipePath): void => {
    const direction = path[path.length - 1];
    if (!direction) return;
    const parentPath = path.slice(0, -1);
    const parent = recipeAtPath(recipe, parentPath);
    if (parent.kind !== "operation") return;
    onChange(
      replaceRecipeAtPath(
        recipe,
        parentPath,
        direction === "left" ? parent.right : parent.left,
      ),
    );
    setSelectedPath(parentPath);
    closePicker();
  };
  const selectedRecipe = recipeAtPath(recipe, selectedPath);

  return (
    <div className="wide mk-recipe">
      <span className="mk-recipe-label">{label}</span>
      <div className="mk-recipe-expression">
        <RecipeSlots
          recipe={recipe}
          path={[]}
          selectedPath={selectedPath}
          onSelect={openPicker}
        />
        <button
          type="button"
          className="mk-recipe-expand"
          aria-label={t.formulaAdd}
          onClick={(event) => appendFormula(event.currentTarget)}
        >
          +
        </button>
      </div>
      {pickerPosition &&
        createPortal(
          <div
            className="mk-formula-picker"
            role="dialog"
            aria-label={t.formulaPickerTitle}
            style={pickerPosition}
          >
            <header>
              <strong>{t.formulaPickerTitle}</strong>
              <div className="mk-formula-picker-actions">
                {selectedPath.length > 0 && (
                  <button
                    type="button"
                    className="mk-formula-picker-remove"
                    onClick={() => removeFormulaPart(selectedPath)}
                    aria-label={t.formulaRemove}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={closePicker}
                  aria-label={t.cancel}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            </header>
            {selectedRecipe.kind === "operation" ? (
              <section>
                <small>{t.operatorCards}</small>
                <div className="mk-formula-picker-operators">
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
                      onClick={() =>
                        choosePickerItem(`operator:${operatorName}`)
                      }
                      aria-label={operatorName}
                    >
                      {labelText}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section>
                <small>{t.valueCards}</small>
                <div className="mk-formula-picker-values">
                  {names.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => choosePickerItem(`value:${name}`)}
                    >
                      {humanizeValue(name)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="mk-formula-picker-number"
                    onClick={() => choosePickerItem("number")}
                  >
                    {t.numberCard}
                  </button>
                </div>
              </section>
            )}
          </div>,
          document.body,
        )}
      {numberEntry !== null &&
        createPortal(
          <div className="mk-keypad-backdrop">
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
          </div>,
          document.body,
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
    <div
      className="mk-keypad"
      role="dialog"
      aria-modal="true"
      aria-label={t.numberPadTitle}
    >
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
  onSelect: (path: RecipePath, trigger: HTMLButtonElement) => void;
}) {
  const selected =
    path.length === selectedPath.length &&
    path.every((part, index) => part === selectedPath[index]);
  if (recipe.kind !== "operation")
    return (
      <button
        type="button"
        className={`mk-recipe-slot${selected ? " selected" : ""}`}
        onClick={(event) => onSelect(path, event.currentTarget)}
      >
        <span>{recipeLabel(recipe)}</span>
        <span className="mk-recipe-caret" aria-hidden="true">
          ▾
        </span>
      </button>
    );
  return (
    <>
      <RecipeSlots
        recipe={recipe.left}
        path={[...path, "left"]}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
      <button
        type="button"
        className={`mk-recipe-operator${selected ? " selected" : ""}`}
        onClick={(event) => onSelect(path, event.currentTarget)}
      >
        <span>
          {
            { add: "+", subtract: "−", multiply: "×", divide: "÷" }[
              recipe.operator
            ]
          }
        </span>
        <span className="mk-recipe-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      <RecipeSlots
        recipe={recipe.right}
        path={[...path, "right"]}
        selectedPath={selectedPath}
        onSelect={onSelect}
      />
    </>
  );
}
