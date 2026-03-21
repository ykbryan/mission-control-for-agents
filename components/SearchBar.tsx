"use client";
interface Props {
  value: string;
  onChange: (v: string) => void;
}
export default function SearchBar({ value, onChange }: Props) {
  return (
    <div style={{ position: "relative" }}>
      <input
        id="search-input"
        type="text"
        placeholder="Search agents..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 8,
          padding: "7px 36px 7px 12px",
          color: "#f0f0f0",
          fontSize: 13,
          width: 220,
          outline: "none",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "rgba(232,93,39,0.5)")}
        onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
      />
      <span style={{
        position: "absolute",
        right: 10,
        top: "50%",
        transform: "translateY(-50%)",
        fontSize: 11,
        color: "#555",
        background: "rgba(255,255,255,0.06)",
        padding: "1px 5px",
        borderRadius: 4,
        pointerEvents: "none",
      }}>/</span>
    </div>
  );
}
