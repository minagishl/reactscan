import { fetch } from "undici";
import type { CVEUrlScanOptions, CVEUrlScanResult } from "../../types/cve.js";
import { logger } from "../logger.js";

const DEFAULT_TIMEOUT = 10000;

const VULNERABILITY_PATTERNS = [
  /^[0-9]+:E\{/m,
  /"digest"\s*:\s*"[^"]*RSC/i,
  /ReactServerComponentsError|RSCError/i,
  /text\/x-component.*error/i,
  /NEXT_REDIRECT/i,
  /Server Actions/i,
  /createActionProxy/i,
  /^[0-9]+:I\[/m,
  /^[0-9]+:S/m,
];

const VULNERABLE_VERSION_PATTERNS = [
  /(?:"|&quot;)next(?:"|&quot;)[^"]*(?:"|&quot;)(?:15\.0\.[0-2]|15\.1\.0|16\.0\.[0-6])(?:"|&quot;)/i,
  /next[@/](?:15\.0\.[0-2]|15\.1\.0|16\.0\.[0-6])/i,
  /(?:"|&quot;)react(?:"|&quot;)[^"]*(?:"|&quot;)19\.(?:0\.0|1\.[0-1]|2\.[0-1])(?:"|&quot;)/i,
  /react[@/]19\.(?:0\.0|1\.[0-1]|2\.[0-1])/i,
  /react-server-dom-(?:webpack|turbopack|parcel)[^"]*(?:"|&quot;)19\./i,
];

const PROBE_ENDPOINTS = ["", "/api", "/api/action", "/actions"];
type HeaderLike = {
  get(name: string): string | null;
  has(name: string): boolean;
};

const ensureUrl = (target: string): string => {
  const trimmed = target.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const createProbePayload = (): { body: string; contentType: string } => {
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="0"',
    "",
    '["$@1"]',
    `--${boundary}`,
    'Content-Disposition: form-data; name="1"',
    "",
    "{}",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
};

const checkRscHeaders = (headers: HeaderLike): boolean => {
  const contentType = headers.get("content-type") || "";
  return (
    contentType.includes("text/x-component") ||
    contentType.includes("application/x-component") ||
    headers.has("x-action-revalidated") ||
    headers.has("x-action-redirect")
  );
};

const checkVersionVulnerability = async (
  targetUrl: string,
  timeout: number,
  debug?: boolean
): Promise<{ vulnerable: boolean; matchedPattern?: string }> => {
  try {
    const response = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "reactscan/1.2.0",
        Accept: "text/html,*/*",
      },
      signal: AbortSignal.timeout(timeout),
    });

    const html = await response.text();

    for (const pattern of VULNERABLE_VERSION_PATTERNS) {
      if (pattern.test(html)) {
        if (debug) logger.debug(`Version pattern matched: ${pattern.source}`);
        return { vulnerable: true, matchedPattern: pattern.source };
      }
    }
  } catch (error) {
    if (debug) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.debug(`Version check failed: ${msg}`);
    }
  }

  return { vulnerable: false };
};

const probeEndpoint = async (
  baseUrl: string,
  endpoint: string,
  timeout: number,
  debug?: boolean
): Promise<{ vulnerable: boolean; statusCode: number; matchedPattern?: string }> => {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const targetUrl = endpoint ? normalizedBase + endpoint : normalizedBase || baseUrl;
  const probe = createProbePayload();

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": probe.contentType,
      "User-Agent": "reactscan/1.2.0",
      Accept: "text/x-component, */*",
      "Next-Action": "reactscan-probe",
      RSC: "1",
    },
    body: probe.body,
    signal: AbortSignal.timeout(timeout),
  });

  const responseText = await response.text();
  const hasRscHeaders = checkRscHeaders(response.headers);

  let matchedPattern: string | undefined;
  const patternMatch = VULNERABILITY_PATTERNS.some((pattern) => {
    const matches = pattern.test(responseText);
    if (matches) {
      matchedPattern = pattern.source;
    }
    return matches;
  });

  const isVulnerable =
    (response.status === 500 && patternMatch) ||
    (hasRscHeaders && patternMatch) ||
    (response.status >= 200 && response.status < 500 && patternMatch);

  if (debug) {
    logger.debug(
      `Probe ${targetUrl} -> ${response.status}${matchedPattern ? ` (pattern ${matchedPattern})` : ""}`
    );
  }

  return {
    vulnerable: isVulnerable,
    statusCode: response.status,
    matchedPattern,
  };
};

export async function scanRemoteCVE(
  url: string,
  options?: CVEUrlScanOptions
): Promise<CVEUrlScanResult> {
  const cveId = options?.cveId || "CVE-2025-55182";
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const targetUrl = ensureUrl(url);
  const startTime = Date.now();
  let lastStatus: number | null = null;

  try {
    const versionCheck = await checkVersionVulnerability(targetUrl, timeout, options?.debug);
    if (versionCheck.vulnerable) {
      return {
        cve: cveId,
        url: targetUrl,
        vulnerable: true,
        statusCode: 200,
        responseTime: Date.now() - startTime,
        signature: `version:${versionCheck.matchedPattern ?? "detected"}`,
      };
    }

    for (const endpoint of PROBE_ENDPOINTS) {
      try {
        const probe = await probeEndpoint(targetUrl, endpoint, timeout, options?.debug);
        lastStatus = probe.statusCode;
        if (probe.vulnerable) {
          const signature = probe.matchedPattern
            ? `probe:${endpoint || "/"}:${probe.matchedPattern}`
            : `probe:${endpoint || "/"}`;
          return {
            cve: cveId,
            url: endpoint ? targetUrl.replace(/\/$/, "") + endpoint : targetUrl,
            vulnerable: true,
            statusCode: probe.statusCode,
            responseTime: Date.now() - startTime,
            signature,
          };
        }
      } catch (error) {
        if (options?.debug) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.debug(`Probe failed for ${endpoint || "/"}: ${msg}`);
        }
      }
    }

    if (lastStatus === null) {
      try {
        const fallback = await probeEndpoint(targetUrl, "", timeout, options?.debug);
        lastStatus = fallback.statusCode;
      } catch (error) {
        if (options?.debug) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.debug(`Final probe failed: ${msg}`);
        }
      }
    }

    return {
      cve: cveId,
      url: targetUrl,
      vulnerable: false,
      statusCode: lastStatus,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      cve: cveId,
      url: targetUrl,
      vulnerable: false,
      statusCode: lastStatus,
      responseTime: Date.now() - startTime,
      error: message,
    };
  }
}
