import { ImageResponse } from "next/og";

export const alt = "Mainpot — Keep the game friendly. Keep the money exact.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background:
            "radial-gradient(circle at 80% 10%, #cbd5ff 0, transparent 35%), radial-gradient(circle at 25% 90%, #e2d7ff 0, transparent 34%), #f7f8fb",
          color: "#111318",
          display: "flex",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px 78px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
          <div style={{ alignItems: "center", display: "flex", fontSize: 34, fontWeight: 700 }}>
            <div
              style={{
                alignItems: "center",
                background: "#111318",
                borderRadius: 18,
                color: "white",
                display: "flex",
                height: 58,
                justifyContent: "center",
                marginRight: 18,
                width: 58,
              }}
            >
              <div style={{ border: "3px solid white", borderRadius: 3, display: "flex", height: 22, width: 34 }} />
            </div>
            Mainpot
          </div>
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -4, lineHeight: 1.02, marginTop: 54 }}>
            Keep the game friendly. Keep the money exact.
          </div>
          <div style={{ color: "#5f6670", fontSize: 28, marginTop: 28 }}>
            The shared ledger for poker night.
          </div>
        </div>

        <div style={{ display: "flex", height: 390, position: "relative", width: 290 }}>
          <div
            style={{
              border: "4px solid rgba(17,19,24,.22)",
              borderRadius: 34,
              height: 300,
              left: 0,
              position: "absolute",
              top: 75,
              transform: "rotate(-9deg)",
              width: 190,
            }}
          />
          <div
            style={{
              alignItems: "flex-start",
              background: "white",
              border: "4px solid #111318",
              borderRadius: 34,
              boxShadow: "0 30px 70px rgba(17,19,24,.22)",
              color: "#111318",
              display: "flex",
              fontSize: 72,
              fontWeight: 800,
              height: 320,
              justifyContent: "flex-end",
              left: 34,
              position: "absolute",
              top: 10,
              padding: 26,
              transform: "rotate(5deg)",
              width: 190,
            }}
          >
            ♠
          </div>
        </div>
      </div>
    ),
    size
  );
}
