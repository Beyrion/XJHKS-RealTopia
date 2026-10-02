export function Toggle({
  label,
  checked,
  id,
  onChange,
}: {
  label: string;
  checked: boolean;
  id: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i />
    </label>
  );
}
