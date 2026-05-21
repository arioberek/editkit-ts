import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") ?? "editkit";
  const description =
    searchParams.get("description") ?? "Robust LLM edit-format toolkit for TypeScript.";

  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "radial-gradient(60% 60% at 30% 30%, #1a1a1a 0%, #050505 100%)",
        color: "#fafafa",
        padding: "80px 96px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "linear-gradient(135deg, #f59e0b 0%, #dc2626 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 36,
            fontWeight: 700,
            color: "#0a0a0a",
          }}
        >
          ek
        </div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          editkit
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            fontSize: title.length > 40 ? 64 : 80,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            maxWidth: 1100,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 30,
            color: "#a1a1aa",
            lineHeight: 1.3,
            maxWidth: 950,
          }}
        >
          {description}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 22,
          color: "#71717a",
          fontFamily: "monospace",
        }}
      >
        <span>npm i editkit</span>
        <span>editkit.arielton.com</span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
