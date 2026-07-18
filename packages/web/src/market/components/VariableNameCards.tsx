export function VariableNameField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (name: string) => void;
}) {
  return (
    <div className="wide mk-variable-names">
      <label>
        <span>{label}</span>
        <input
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          pattern="[A-Za-z_][A-Za-z0-9_]*"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}
