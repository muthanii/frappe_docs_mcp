/**
 * URL construction for the Frappe framework user documentation.
 *
 * Kept separate from the server so the sanitising rules are directly testable.
 */

/** Every page this server can reach lives under this prefix. */
export const BASE_URL = 'https://docs.frappe.io/framework/user';

/** Thrown when a caller-supplied path cannot be turned into a safe docs URL. */
export class InvalidDocPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDocPathError';
  }
}

/** Matches a leading `framework/user` segment pair, with or without a trailing slash. */
const LEADING_BASE_SEGMENTS = /^framework\/user(?:\/|$)/i;

/**
 * Turn a caller-supplied relative path into an absolute docs URL.
 *
 * The result is always under {@link BASE_URL}: `..` segments are rejected rather
 * than resolved, and every remaining segment is percent-encoded, so a caller
 * cannot escape the prefix or smuggle in a query string or fragment.
 *
 * Clients sometimes include the `framework/user` prefix themselves (once, or
 * even repeatedly). Those leading copies are stripped so both `en/tutorial` and
 * `framework/user/en/tutorial` resolve to the same page.
 *
 * @param rawPath Relative path under the docs site, e.g. `en/tutorial`.
 * @throws {InvalidDocPathError} If the path is empty or cannot be made safe.
 */
export function buildDocsUrl(rawPath: string): string {
  if (typeof rawPath !== 'string') {
    throw new InvalidDocPathError('path must be a string');
  }

  const trimmed = rawPath.trim();
  if (trimmed === '') {
    throw new InvalidDocPathError('path must not be empty');
  }
  if (/[?#]/.test(trimmed)) {
    throw new InvalidDocPathError('path must not contain "?" or "#"');
  }

  // Strip leading slashes so an absolute-looking path is still treated as
  // relative to the base, then drop any leading copies of the base segments.
  let path = trimmed.replace(/^\/+/, '');
  while (LEADING_BASE_SEGMENTS.test(path)) {
    path = path.replace(LEADING_BASE_SEGMENTS, '');
  }

  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new InvalidDocPathError('path must not contain "." or ".." segments');
  }

  // A path of exactly `framework/user` reduces to nothing and means the index.
  if (segments.length === 0) {
    return BASE_URL;
  }

  return `${BASE_URL}/${segments.map(encodeURIComponent).join('/')}`;
}
