import { ImageResponse } from "next/og";

export const alt = "Mainpot — Keep the game friendly. Keep the money exact.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Spade({ size: iconSize }: { size: number }) {
  return (
    <svg
      aria-hidden="true"
      height={iconSize}
      viewBox="0 0 24 24"
      width={iconSize}
    >
      <path
        d="M12 2C9.95 5.6 4 9.02 4 14.13A4.12 4.12 0 0 0 8.12 18.25c1.14 0 2.18-.47 2.94-1.23-.23 1.82-.97 3.23-2.31 4.98h6.5c-1.34-1.75-2.08-3.16-2.31-4.98a4.15 4.15 0 0 0 7.06-2.89C20 9.02 14.05 5.6 12 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f7f8fa",
          color: "#111318",
          display: "flex",
          height: "100%",
          justifyContent: "space-between",
          overflow: "hidden",
          padding: "72px 78px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "#e8eaf3",
            display: "flex",
            height: 630,
            position: "absolute",
            right: 0,
            top: 0,
            width: 340,
          }}
        />

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
              <Spade size={30} />
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
              background: "#d9dce6",
              border: "5px solid #8b909d",
              borderRadius: 20,
              height: 292,
              left: 0,
              position: "absolute",
              top: 70,
              transform: "rotate(-7deg)",
              width: 205,
            }}
          />
          <div
            style={{
              alignItems: "center",
              background: "white",
              border: "5px solid #111318",
              borderRadius: 20,
              boxShadow: "10px 12px 0 #c4c8d3",
              color: "#111318",
              display: "flex",
              height: 308,
              justifyContent: "center",
              left: 48,
              position: "absolute",
              top: 18,
              transform: "rotate(4deg)",
              width: 220,
            }}
          >
            <Spade size={100} />
          </div>
        </div>
      </div>
    ),
    size
  );
}
