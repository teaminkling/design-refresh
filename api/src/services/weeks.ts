/**
 * Internal and external handlers for week endpoints.
 */

import {ACTIVE_YEAR, EDITORS} from "../../../data/constants/setup";
import Week from "../../../data/core/Week";
import {WEEKS} from "../constants/kv";
import {createJsonResponse, createNotFoundResponse} from "../utils/http";

/**
 * Return the weeks information, redacting if the user signed in is not an authenticated user.
 *
 * Note that this may not be sorted.
 *
 * @param {KVNamespace} kv the main key-value store
 * @param {string | undefined} origin the allowed origin for the CORS headers
 * @param {string | undefined} identifier the identifier of the calling user
 * @returns {Promise<Response>} the response
 */
export const getWeeks = async (
  kv: KVNamespace, origin?: string, identifier?: string,
): Promise<Response> => {
  const weeks: Record<string, Week> = JSON.parse(
    (await kv.get(`${WEEKS}/${ACTIVE_YEAR}`)) || "{}"
  );

  let responseWeeks: Record<string, Week> = {};

  const isStaff: boolean = identifier ? EDITORS.includes(identifier) : false;
  if (!isStaff) {
    Object.keys(weeks).forEach((key: string) => {
      const week: Week = weeks[key];

      if (week.isPublished) {
        responseWeeks[key] = week;
      }
    });
  } else {
    responseWeeks = weeks;
  }

  return createJsonResponse(JSON.stringify(responseWeeks), origin);
};

/**
 * Edit information for all weeks at the same time.
 *
 * The body is expected to receive a JSON object of the form `{"weeks": []}`.
 *
 * This is an idempotent call and is not rate limited as it is authenticated to staff users
 * only. We are not concerned about race conditions.
 *
 * @param {Request} request the request
 * @param {KVNamespace} kv the main key-value store
 * @param {string | undefined} origin the allowed origin for the CORS headers
 * @param {string | undefined} identifier the identifier of the calling user
 * @returns {Promise<Response>} the response
 */
export const putWeeks = async (
  request: Request, kv: KVNamespace, origin?: string, identifier?: string,
): Promise<Response> => {
  // Don't let anybody but a staff member call this endpoint.

  const isStaff: boolean = identifier ? EDITORS.includes(identifier) : false;
  if (!isStaff) {
    return createNotFoundResponse(origin);
  }

  // Validate type and length and then escape the correct request variables. This is such that a
  // hijacked account can't be used to perform more disastrous effects on the backend.

  // TODO

  const input: Record<number, Week> = await request.json();

  // Update the weeks directly.

  await kv.put(`${WEEKS}/${ACTIVE_YEAR}`, JSON.stringify(input));

  return createJsonResponse("{}", origin);
};
