import { parse } from 'url';

/**
 * A set of expected url query params.
 *
 * Each param can describe when it should be valid. This can be:
 * - true: the query params has to be present in the url
 * - false: the query param has to be absent in the url
 * - <string>: the query param in the url has to match the string value
 * - <predicate>: the predicate is invoked with the query param value in the url and should return true
 */
export type ExpectedQueryParams = {
  [name: string]: boolean | string | ((value: string) => boolean)
};

/**
 * Return whether given url is compliant with the expected query params.
 *
 * @param params The params that are expected on the url.
 * @param url The url to verify the expectations on.
 */
export function hasExpectedQueryParams(params: ExpectedQueryParams, url: string | undefined): boolean {
  const urlQueryParams = new URLSearchParams(parse(url || '').query || '');
  for (const paramName in params) {
    const expectation = params[paramName];
    if (typeof expectation === 'boolean') {
      if (urlQueryParams.has(paramName) !== expectation) {
        return false;
      }
    } else if (typeof expectation === 'string') {
      if (urlQueryParams.get(paramName) !== expectation) {
        return false;
      }
    } else {
      const value = urlQueryParams.get(paramName);
      if (value === null || !expectation(value)) {
        return false;
      }
    }
  }
  return true;
}
