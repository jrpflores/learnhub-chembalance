import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";

const LOCAL_HOSTNAMES = new Set(["", "localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const runningInDocker = existsSync("/.dockerenv");

function firstHeaderValue(value?: string | null) {
  if (!value) {
    return "";
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .find(Boolean) ?? "";
}

function configuredShareUrls() {
  const envValues = [process.env.LOGIN_SHARE_URLS, process.env.LOGIN_SHARE_URL];
  const combined = envValues
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(",");

  if (!combined) {
    return [];
  }

  return combined
    .split(",")
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

function parseHost(hostHeader: string) {
  if (!hostHeader) {
    return { hostname: "", port: "" };
  }

  try {
    const parsed = new URL(`http://${hostHeader}`);
    return { hostname: parsed.hostname, port: parsed.port };
  } catch {
    return { hostname: hostHeader, port: "" };
  }
}

function formatHostForUrl(hostname: string) {
  if (hostname.includes(":") && !hostname.startsWith("[") && !hostname.endsWith("]")) {
    return `[${hostname}]`;
  }
  return hostname;
}

function isLocalHost(hostname: string) {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

function isLinkLocal(address: string) {
  return address.startsWith("169.254.");
}

function lanPriority(address: string) {
  if (address.startsWith("192.168.")) {
    return 1;
  }
  if (address.startsWith("10.")) {
    return 2;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) {
    return 3;
  }
  return 4;
}

function getLanIpv4Addresses() {
  const results = new Set<string>();
  const interfaces = networkInterfaces();

  Object.entries(interfaces).forEach(([name, addresses]) => {
    if (!addresses || /^(lo|docker|br-|veth|awdl|utun)/i.test(name)) {
      return;
    }

    const entries = addresses as Array<{ address: string; family: string | number; internal?: boolean }>;
    entries.forEach((entry) => {
      const family = typeof entry.family === "string" ? entry.family : String(entry.family);
      if (family !== "IPv4" && family !== "4") {
        return;
      }
      if (entry.internal || isLinkLocal(entry.address)) {
        return;
      }
      results.add(entry.address);
    });
  });

  return Array.from(results).sort((a, b) => {
    const priorityDiff = lanPriority(a) - lanPriority(b);
    return priorityDiff !== 0 ? priorityDiff : a.localeCompare(b);
  });
}

function toUrl(protocol: "http" | "https", hostname: string, port: string) {
  const safeHost = formatHostForUrl(hostname);
  return `${protocol}://${safeHost}${port ? `:${port}` : ""}/login`;
}

export function resolveLoginAccessUrls(payload: {
  hostHeader?: string | null;
  forwardedHostHeader?: string | null;
  forwardedProtoHeader?: string | null;
}) {
  const configuredUrls = configuredShareUrls();
  const requestHost = firstHeaderValue(payload.forwardedHostHeader) || firstHeaderValue(payload.hostHeader);
  const { hostname, port } = parseHost(requestHost);

  const rawProto = firstHeaderValue(payload.forwardedProtoHeader).toLowerCase();
  const protocol: "http" | "https" = rawProto === "https" ? "https" : "http";

  const urls = new Set<string>();
  configuredUrls.forEach((url) => urls.add(url));
  if (hostname) {
    urls.add(toUrl(protocol, hostname, port));
  }

  if (isLocalHost(hostname) && !runningInDocker) {
    getLanIpv4Addresses().forEach((ip) => urls.add(toUrl("http", ip, port)));
  }

  return Array.from(urls).slice(0, 4);
}
