/**
 * Terminal output formatting for REST Lens CLI.
 *
 * Produces clean, colored output like:
 *
 *   error  Rule 05:  POST/GET tunneling detected        /users/delete
 *   warn   Rule 01:  Singular collection name           /order
 *   ──────────────────────────────────────────────────
 *   2 errors   3 warnings   1 info
 */

// ── ANSI helpers ───────────────────────────────────────
const esc = (code: string) => `\x1b[${code}m`;
const reset = esc("0");

const c = {
  red: (s: string) => `${esc("31")}${s}${reset}`,
  yellow: (s: string) => `${esc("33")}${s}${reset}`,
  blue: (s: string) => `${esc("34")}${s}${reset}`,
  green: (s: string) => `${esc("32")}${s}${reset}`,
  dim: (s: string) => `${esc("2")}${s}${reset}`,
  bold: (s: string) => `${esc("1")}${s}${reset}`,
  cyan: (s: string) => `${esc("36")}${s}${reset}`,
};

// ── Types ──────────────────────────────────────────────
interface Violation {
  message: string;
  severity: string;
  rule_id: number;
  rule_slug?: string;
}

// Array format (old): [{ key: {...}, value: Violation[] }]
interface ViolationGroupArray {
  key: { path?: string; operation_id?: string; schema_path?: string };
  value: Violation[];
}

// Object format (violations-service): { path: { "/foo": { key, violations } }, ... }
interface ViolationGroupObject {
  key: { violation_key_type?: string; path?: string; operation_id?: string; schema_path?: string };
  violations: Violation[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ViolationsResult {
  violations?: ViolationGroupArray[] | Record<string, Record<string, ViolationGroupObject>>;
  totalViolations?: number;
}

interface FlatViolation {
  severity: string;
  ruleLabel: string;
  message: string;
  location: string;
}

// ── Formatting ─────────────────────────────────────────

function severityLabel(severity: string): string {
  const labelMap: Record<string, string> = {
    error: c.red("error"),
    warning: c.yellow("warn "),
    info: c.blue("info "),
  };
  return labelMap[severity] ?? c.dim(severity.padEnd(5));
}

function ruleLabel(ruleId: number, ruleSlug?: string): string {
  if (ruleSlug) return c.bold(ruleSlug);
  return c.bold(`Rule ${String(ruleId).padStart(2, "0")}`);
}

function pad(str: string, len: number): string {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  const diff = len - visible.length;
  return diff > 0 ? str + " ".repeat(diff) : str;
}

function flatten(result: ViolationsResult): FlatViolation[] {
  const flat: FlatViolation[] = [];
  const violations = result.violations;
  if (!violations) return flat;

  if (Array.isArray(violations)) {
    // Array format: [{ key, value: Violation[] }]
    for (const group of violations) {
      const location = group.key.path || group.key.schema_path || group.key.operation_id || "";
      for (const v of group.value) {
        flat.push({
          severity: v.severity,
          ruleLabel: ruleLabel(v.rule_id, v.rule_slug),
          message: v.message,
          location,
        });
      }
    }
  } else {
    // Object format: { path: { "/foo": { key, violations } }, operation_id: {...}, ... }
    for (const typeGroups of Object.values(violations)) {
      for (const group of Object.values(typeGroups)) {
        const location = group.key.path || group.key.schema_path || group.key.operation_id || "";
        for (const v of group.violations) {
          flat.push({
            severity: v.severity,
            ruleLabel: ruleLabel(v.rule_id, v.rule_slug),
            message: v.message,
            location,
          });
        }
      }
    }
  }

  const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
  flat.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  return flat;
}

// ── Public API ─────────────────────────────────────────

export function printViolations(result: ViolationsResult): void {
  const flat = flatten(result);

  if (flat.length === 0) {
    console.log(`\n  ${c.green("\u2714")} No violations found.\n`);
    return;
  }

  // Compute column widths from actual data
  const ruleColWidth = Math.max(...flat.map((v) => v.ruleLabel.replace(/\x1b\[[0-9;]*m/g, "").length)) + 1;
  const msgColWidth = Math.min(
    Math.max(...flat.map((v) => v.message.length)),
    52,
  );

  console.log("");
  for (const v of flat) {
    const sev = severityLabel(v.severity);
    const rule = pad(v.ruleLabel + ":", ruleColWidth + 1);
    const msg = pad(v.message.length > msgColWidth ? v.message.slice(0, msgColWidth - 1) + "\u2026" : v.message, msgColWidth);
    const loc = v.location ? c.dim(v.location) : "";
    console.log(`  ${sev}  ${rule} ${msg}  ${loc}`);
  }

  // Divider
  const divWidth = Math.min(process.stdout.columns || 80, 72);
  console.log(c.dim(`  ${"─".repeat(divWidth)}`));

  // Summary counts
  let errorCount = 0, warnCount = 0, infoCount = 0;
  for (const v of flat) {
    if (v.severity === "error") errorCount++;
    else if (v.severity === "warning") warnCount++;
    else infoCount++;
  }

  const parts: string[] = [];
  if (errorCount > 0) parts.push(c.red(`${errorCount} error${errorCount !== 1 ? "s" : ""}`));
  if (warnCount > 0) parts.push(c.yellow(`${warnCount} warning${warnCount !== 1 ? "s" : ""}`));
  if (infoCount > 0) parts.push(c.blue(`${infoCount} info`));

  console.log(`  ${parts.join("    ")}`);
  console.log("");
}

export function printReportUrl(server: string, orgSlug: string, projectName: string, specId: string): void {
  const url = `${server}/projects/${orgSlug}/${projectName}`;
  console.log(`  ${c.dim("View report:")}  ${c.cyan(url)}`);
  console.log("");
}

export function printNoViolations(): void {
  console.log(`\n  ${c.green("\u2714")} No violations found.\n`);
}
