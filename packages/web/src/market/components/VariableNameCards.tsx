import { humanizeValue, VARIABLE_NAME_CARDS } from "../market-recipe.ts";

export function VariableNameCards({
  label,
  value: selected,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (name: string) => void;
}) {
  return (
    <div className="wide mk-variable-names">
      <span>{label}</span>
      <div>
        {VARIABLE_NAME_CARDS.map((name) => (
          <button
            key={name}
            type="button"
            className={selected === name ? "selected" : ""}
            onClick={() => onChange(name)}
          >
            {humanizeValue(name)}
          </button>
        ))}
      </div>
    </div>
  );
}
