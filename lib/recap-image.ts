export const RECAP_WIDTH = 1080;
export const RECAP_HEIGHT = 1920;
export const RECAP_EXPORT_SCALE = 2;
export const RECAP_FONT_URL = "/fonts/inter-latin.woff2";
export const RECAP_FONT_FAMILY = "Mainpot Recap Inter";

export function recapFontFace(source = RECAP_FONT_URL): string {
  return `@font-face { font-family: "${RECAP_FONT_FAMILY}"; src: url("${source}") format("woff2"); font-style: normal; font-weight: 100 900; font-display: swap; }`;
}

let embeddedFont: Promise<string> | undefined;

function loadEmbeddedFont(): Promise<string> {
  embeddedFont ??= fetch(RECAP_FONT_URL)
    .then(async (response) => {
      if (!response.ok) throw new Error("The recap font could not be loaded. Please try again.");
      const blob = await response.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("The recap font could not be prepared."));
        reader.readAsDataURL(blob);
      });
    })
    .catch((error) => {
      embeddedFont = undefined;
      throw error;
    });
  return embeddedFont;
}

/** Embed the exact preview font and rasterize the vector at twice story size. */
export async function renderRecapPng(svg: SVGSVGElement): Promise<Blob> {
  // Capture the selected title/stats before waiting for the font request.
  const exportedSvg = svg.cloneNode(true) as SVGSVGElement;
  const font = await loadEmbeddedFont();
  const fontStyle = exportedSvg.querySelector("[data-recap-font]");
  if (!fontStyle) throw new Error("The recap preview is still loading.");
  fontStyle.textContent = recapFontFace(font);
  const width = RECAP_WIDTH * RECAP_EXPORT_SCALE;
  const height = RECAP_HEIGHT * RECAP_EXPORT_SCALE;
  exportedSvg.setAttribute("width", String(width));
  exportedSvg.setAttribute("height", String(height));
  exportedSvg.removeAttribute("class");
  const source = new XMLSerializer().serializeToString(exportedSvg);
  const sourceUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The recap image could not be rendered."));
      image.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser cannot create an image for this recap.");
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The recap image could not be exported."));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
