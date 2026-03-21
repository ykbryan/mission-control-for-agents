interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchTrigger({ value, onChange }: Props) {
  return (
    <label className="search-trigger" htmlFor="search-input">
      <svg viewBox="0 0 24 24" className="search-trigger__icon" aria-hidden="true">
        <path
          d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <input
        id="search-input"
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search agents, roles, or skills"
        className="search-trigger__input"
      />
      <span className="search-trigger__shortcut">/</span>
    </label>
  );
}
