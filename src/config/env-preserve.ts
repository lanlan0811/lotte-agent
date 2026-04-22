const ENV_VAR_PATTERN = /\$\{[A-Z_][A-Z0-9_]*\}/;
const ENV_VAR_NAME = /^[A-Z_][A-Z0-9_]*$/;

function hasEnvVarRef(value: string): boolean {
  return ENV_VAR_PATTERN.test(value);
}

function tryResolveString(template: string, env: NodeJS.ProcessEnv): string | null {
  const chunks: string[] = [];

  for (let i = 0; i < template.length; i++) {
    if (template[i] === "$") {
      if (template[i + 1] === "$" && template[i + 2] === "{") {
        const start = i + 3;
        const end = template.indexOf("}", start);
        if (end !== -1) {
          const name = template.slice(start, end);
          if (ENV_VAR_NAME.test(name)) {
            chunks.push(`\${${name}}`);
            i = end;
            continue;
          }
        }
      }

      if (template[i + 1] === "{") {
        const start = i + 2;
        const end = template.indexOf("}", start);
        if (end !== -1) {
          const name = template.slice(start, end);
          if (ENV_VAR_NAME.test(name)) {
            const val = env[name];
            if (val === undefined || val === "") {
              return null;
            }
            chunks.push(val!);
            i = end;
            continue;
          }
        }
      }
    }
    chunks.push(template[i]!);
  }

  return chunks.join("");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function restoreEnvVarRefs(
  incoming: unknown,
  parsed: unknown,
  env: NodeJS.ProcessEnv = process.env,
): unknown {
  if (parsed === null || parsed === undefined) {
    return incoming;
  }

  if (typeof incoming === "string" && typeof parsed === "string") {
    if (hasEnvVarRef(parsed)) {
      const resolved = tryResolveString(parsed, env);
      if (resolved === incoming) {
        return parsed;
      }
    }
    return incoming;
  }

  if (Array.isArray(incoming) && Array.isArray(parsed)) {
    return incoming.map((item, i) =>
      i < parsed.length ? restoreEnvVarRefs(item, parsed[i], env) : item,
    );
  }

  if (isPlainObject(incoming) && isPlainObject(parsed)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (key in parsed) {
        result[key] = restoreEnvVarRefs(value, parsed[key], env);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return incoming;
}

export function substituteEnvVars(value: unknown, env: NodeJS.ProcessEnv = process.env): unknown {
  if (typeof value === "string") {
    if (!hasEnvVarRef(value)) return value;
    const resolved = tryResolveString(value, env);
    return resolved ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => substituteEnvVars(item, env));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = substituteEnvVars(val, env);
    }
    return result;
  }

  return value;
}
