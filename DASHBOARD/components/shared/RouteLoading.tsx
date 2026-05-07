export function RouteLoading() {
  return (
    <div
      aria-busy
      role="status"
      style={{
        minHeight: "calc(100vh - 48px)",
        display: "grid",
        placeItems: "center",
        direction: "rtl",
      }}
    >
      <div
        style={{
          display: "grid",
          placeItems: "center",
          gap: 12,
          color: "#61706a",
          fontFamily: "Assistant, Rubik, system-ui, sans-serif",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "3px solid #d4dad6",
            borderTopColor: "#2563eb",
            animation: "rf-route-spin 0.75s linear infinite",
          }}
        />
        <span>טוען...</span>
      </div>
      <style>{`@keyframes rf-route-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
