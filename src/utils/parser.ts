import { parse } from "node-html-parser";

export type HtmlAnalysisResult = {
  hasFlightData: boolean;
  hasNextjsMarkers: boolean;
  hasServerActionMarkers: boolean;
  scriptContents: string[];
  dataAttributes: string[];
};

const serverActionPatterns = [
  "use server",
  "__SERVER_ACTIONS__",
  "serverActionsManifest",
  "server_actions",
  "serverActions",
];

const nextjsFlightPatterns = ["__NEXT_DATA__", "__next_f", "react-server-dom-webpack"];

export const analyzeHtml = (html: string): HtmlAnalysisResult => {
  const result: HtmlAnalysisResult = {
    hasFlightData: false,
    hasNextjsMarkers: false,
    hasServerActionMarkers: false,
    scriptContents: [],
    dataAttributes: [],
  };

  try {
    const root = parse(html);

    const scripts = root.querySelectorAll("script");
    for (const script of scripts) {
      const content = script.textContent || "";
      result.scriptContents.push(content);

      const lowerContent = content.toLowerCase();
      for (const pattern of serverActionPatterns) {
        if (lowerContent.includes(pattern.toLowerCase())) {
          result.hasServerActionMarkers = true;
          break;
        }
      }

      for (const pattern of nextjsFlightPatterns) {
        if (lowerContent.includes(pattern.toLowerCase())) {
          result.hasNextjsMarkers = true;
        }
      }
    }

    const allElements = root.querySelectorAll("*");
    for (const el of allElements) {
      const attrs = el.attributes;
      for (const [key, value] of Object.entries(attrs)) {
        if (key.includes("data-nextjs") || key.includes("data-react")) {
          result.dataAttributes.push(`${key}="${value}"`);
        }
        if (key === "data-nextjs-flight") {
          result.hasFlightData = true;
        }
      }
    }
  } catch {
    // If parsing fails, fall back to simple string search
    const lowerHtml = html.toLowerCase();
    result.hasFlightData = lowerHtml.includes("data-nextjs-flight");
    result.hasNextjsMarkers = nextjsFlightPatterns.some((pattern) =>
      lowerHtml.includes(pattern.toLowerCase())
    );
    result.hasServerActionMarkers = serverActionPatterns.some((pattern) =>
      lowerHtml.includes(pattern.toLowerCase())
    );
  }

  return result;
};

export const stripScriptsAndStyles = (html: string): string => {
  try {
    const root = parse(html);
    root.querySelectorAll("script").forEach((el) => el.remove());
    root.querySelectorAll("style").forEach((el) => el.remove());
    return root.toString();
  } catch {
    return html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, "")
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, "");
  }
};
