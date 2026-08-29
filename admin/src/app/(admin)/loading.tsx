export default function Loading() {
  return (
    <div aria-label="正在加载" aria-live="polite">
      <div className="skeleton" style={{ height: 32, width: 180 }} />
      <div
        className="skeleton"
        style={{ height: 160, marginTop: 24, width: "100%" }}
      />
      <div
        className="skeleton"
        style={{ height: 300, marginTop: 20, width: "100%" }}
      />
    </div>
  );
}
