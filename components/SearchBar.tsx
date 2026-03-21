"use client";

interface Props {
  value: string;
  onChange: (v: string) => void;
  darkMode?: boolean;
}

export default function SearchBar({ value, onChange, darkMode = true }: Props) {
  return (
    <div style={{ position: "relative" }}>
      <input
        id="search-input"
        type="text"
        placeholder="Search agents..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: darkMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.88)",
          border: `1px solid ${darkMode ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.12)"}`,
          borderRadius: 8,
          padding: "7px 36px 7px 12px",
          color: darkMode ? "#f0f0f0" : "#111827",
          fontSize: 13,
          width: 220,
          outline: "none",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "rgba(232,93,39,0.5)")}
        onBlur={(e) => {
          e.target.style.borderColor = darkMode ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.12)";
        }}
      />
      <span
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 11,
          color: darkMode ? "#555" : "#6b7280",
          background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)",
          padding: "1px 5px",
          borderRadius: 4,
          pointerEvents: "none",
        }}
      >
        /
      </span>
    </div>
  );
}
