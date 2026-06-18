// src/views/tb/dashboard/runtime/widgets/control/controlFunctions.ts

export function runParseFunction(fnBody: string | undefined, data: any): boolean {
  if (!fnBody || !fnBody.trim()) {
    return defaultParseBoolean(data);
  }

  try {
    const fn = new Function('data', fnBody);
    const result = fn(data);
    return !!result;
  } catch (err) {
    console.error('[controlFunctions] parseFunction error:', err);
    return defaultParseBoolean(data);
  }
}

export function runTransformFunction(fnBody: string | undefined, value: boolean): any {
  if (!fnBody || !fnBody.trim()) {
    return value;
  }

  try {
    const fn = new Function('value', fnBody);
    return fn(value);
  } catch (err) {
    console.error('[controlFunctions] transformFunction error:', err);
    return value;
  }
}

export function defaultParseBoolean(data: any): boolean {
  if (data === true || data === 1 || data === '1' || data === 'true' || data === 'TRUE') {
    return true;
  }

  if (data === false || data === 0 || data === '0' || data === 'false' || data === 'FALSE') {
    return false;
  }

  if (data && typeof data === 'object') {
    const value = data.value;
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'TRUE') {
      return true;
    }
    if (value === false || value === 0 || value === '0' || value === 'false' || value === 'FALSE') {
      return false;
    }
  }

  return Boolean(data);
}
