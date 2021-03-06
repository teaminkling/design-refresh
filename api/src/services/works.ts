import {AwsClient} from "aws4fetch";
import {ValidationError, ValidationResult} from "joi";
import {
  ACTIVE_YEAR,
  EDITORS,
  MAXIMUM_CONTENT_LENGTH,
  UPLOAD_EXPIRY
} from "../../../data/constants/setup";
import Work, {UrlItem, WORK_SCHEMA} from "../../../data/core/Work";
import {
  WORKS_WITH_ARTIST_INDEX,
  WORKS_WITH_ID_INDEX,
  WORKS_WITH_WEEK_INDEX,
  WORKS_WITHOUT_INDEX
} from "../constants/kv";
import Environment from "../types/environment";
import {scrapeThumbnail, uploadScrapedThumbnail, uploadThumbnails} from "../utils/connectors";
import {postOrEditDiscordWork} from "../utils/discord";
import {
  createBadRequestResponse,
  createForbiddenResponse,
  createJsonResponse,
  createNotFoundResponse
} from "../utils/http";
import {determineShortId, sanitize} from "../utils/io";
import {placeWork} from "../utils/kv";

/**
 * @param {boolean} isStaff if the caller of the GET is a staff member
 * @param {boolean} isSeekingUnapproved if the caller of the GET wants unapproved posts only
 * @param {Work} work the work to check
 * @returns {boolean} whether a work should be included in a GET output
 */
const workRetrievalPredicate = (isStaff: boolean, isSeekingUnapproved: boolean, work: Work) => {
  if (work.isApproved || isStaff) {
    // If they're not staff, the post is approved. If they're not seeking unapproved work,
    // they're seeking approved work. Unless the previous two conditions are met (are staff and
    // want unapproved) then the work must be approved, so the third condition can't be met.

    if (!isStaff || !isSeekingUnapproved || !work.isApproved) {
      // If undefined, this will coerce to true anyway.

      return !work.isSoftDeleted;
    }
  }

  return false;
};

/**
 * Using search terms, retrieve the works.
 *
 * Full index retrieval is possible and acceptable as egress is not billed. It is just slow for
 * the user so the web client does not use it.
 *
 * Unpublished works are not included in the output.
 *
 * Sorting and direct member searching is not possible through this endpoint. It is expected to
 * be done on the frontend as repeated changes of the sort and search would waste backend calls.
 *
 * Params pattern: `?year=<year>&week=<week>&artistId=<artist>`
 *
 * @param {Environment} env the workers environment
 * @param {URLSearchParams} params the search parameters
 * @param {string | undefined} identifier the identifier of the calling user
 * @returns {Promise<Response>} the response
 */
export const getWorks = async (
  env: Environment, params: URLSearchParams, identifier?: string,
): Promise<Response> => {
  const isStaff: boolean = identifier ? EDITORS.includes(identifier) : false;

  // Escape search terms (remove slashes).

  const year: string | null = sanitize(params.get("year")) || ACTIVE_YEAR.toString();
  const week: string | null = sanitize(params.get("week"));
  const artistId: string | null = sanitize(params.get("artistId"));

  // Note the variable name doesn't match the GET name.

  const isSeekingUnapproved: boolean = (
    ["1", "true"].includes(sanitize(params.get("isUnapproved"))?.toLowerCase() || "???")
  );

  // If the artist is present, that cancels the most results, so use that as search. Otherwise,
  // use the week. If neither are present, use all posts in the list.

  const results: Record<string, Work> = {};
  if (artistId) {
    const works_with_artist_index: Record<string, Work> = JSON.parse(
      (await env.REFRESH_KV.get(`${WORKS_WITH_ARTIST_INDEX}/${artistId}`)) || "[]",
    );

    Object.values(works_with_artist_index).filter(
      (work: Work) => workRetrievalPredicate(isStaff, isSeekingUnapproved, work)
    ).forEach((work: Work) => results[work.id] = work);
  } else if (week) {
    const works_with_week_index: Record<string, Work> = JSON.parse(
      (await env.REFRESH_KV.get(`${WORKS_WITH_WEEK_INDEX}/${year}/${week}`)) || "[]",
    );

    Object.values(works_with_week_index).filter(
      (work: Work) => workRetrievalPredicate(isStaff, isSeekingUnapproved, work)
    ).forEach((work: Work) => results[work.id] = work);
  } else {
    const works_without_index: Work[] = JSON.parse(
      (await env.REFRESH_KV.get(`${WORKS_WITHOUT_INDEX}`)) || "[]"
    );

    works_without_index.filter(
      (work: Work) => workRetrievalPredicate(isStaff, isSeekingUnapproved, work)
    ).forEach((work: Work) => results[work.id] = work);
  }

  return createJsonResponse(JSON.stringify(results), env.ALLOWED_ORIGIN);
};

/**
 * Retrieve a single post by ID.
 *
 * There is no authentication check.
 *
 * @param {Environment} env the workers environment
 * @param {URLSearchParams} params the search parameters
 * @returns {Promise<Response>} the response
 */
export const getWork = async (
  env: Environment, params: URLSearchParams,
): Promise<Response> => {
  const id: string | null = sanitize(params.get("id"));
  if (!id || id === "undefined") {
    return createNotFoundResponse(env.ALLOWED_ORIGIN);
  }

  const work: Work = JSON.parse(
    (await env.REFRESH_KV.get(`${WORKS_WITH_ID_INDEX}/${id}`)) || "{}"
  );

  if (!work?.id || work.isSoftDeleted) {
    return createNotFoundResponse(env.ALLOWED_ORIGIN);
  }

  return createJsonResponse(JSON.stringify({[work.id]: work}), env.ALLOWED_ORIGIN);
};

/**
 * Create or update a post in the database.
 *
 * The ID provided by the user is used to find an existing post. If it doesn't exist, the ID is
 * ignored and generated by the backend.
 *
 * This is an idempotent endpoint whether a post already exists. It uses a rate limit of 2 edits
 * per minute. We are not concerned about race conditions.
 *
 * @param {Environment} env the workers environment
 * @param {Request} request the request
 * @param {string | undefined} identifier the identifier of the calling user
 * @returns {Promise<Response>} the response
 */
export const putWork = async (
  env: Environment, request: Request, identifier?: string,
): Promise<Response> => {
  // Ensure user is authenticated at all before doing any other CPU computation.

  if (!identifier) {
    return createForbiddenResponse(env.ALLOWED_ORIGIN);
  }

  // Validate all data and ensure it is escaped for HTML.

  const input: Work = await request.json();

  const validation: ValidationResult = WORK_SCHEMA.validate(input);
  if (validation.error) {
    return createBadRequestResponse(validation.error, env.ALLOWED_ORIGIN);
  }

  // Stop malicious users from self-verifying or editing another person's Discord post on PUT.

  input.isApproved = false;
  input.discordId = undefined;
  input.isSoftDeleted = false;

  // Verify poster is either the same as the one in the work or is a staff member.

  const isStaff: boolean = identifier ? EDITORS.includes(identifier) : false;
  if (!isStaff && input.artistId !== identifier) {
    return createBadRequestResponse(new ValidationError(
      "Posting artist is not the same as the work artist.",
      null,
      [],
    ), env.ALLOWED_ORIGIN);
  }

  // Try to retrieve an existing work.

  const rawBackendWork: string | null = await env.REFRESH_KV.get(
    `${WORKS_WITH_ID_INDEX}/${input.id}`
  );

  let backendWork: Work | null = rawBackendWork ? JSON.parse(rawBackendWork) : null;

  // The backend should ignore erroneously placed works with the "noop" ID.

  if (backendWork?.id === "noop") {
    backendWork = null;
  }

  // If editing, verify that the ID of the work presented matches the one in the backend.

  if (backendWork && backendWork.id !== input.id) {
    return createForbiddenResponse(env.ALLOWED_ORIGIN);
  } else if (!backendWork) {
    // If there's no backend work, then the ID must be changed.

    const newId: string = await determineShortId(input.artistId, input.items);

    // This isn't very robust, but we don't ever expect anything to ever collide.

    if (await env.REFRESH_KV.get(`${WORKS_WITH_ID_INDEX}/${newId}`)) {
      return createBadRequestResponse(new ValidationError(
        "A post already exists with the exact same info! Did you mean to edit a work?",
        null,
        [],
      ), env.ALLOWED_ORIGIN);
    }

    input.id = newId;
  } else {
    // There is a backend work. Keep some old data.

    if (EDITORS.includes(input.artistId)) {
      // Don't let an admin overwrite state with their own user ID.

      input.artistId = backendWork.artistId;
    }

    input.discordId = backendWork.discordId;
    input.submittedTimestamp = backendWork.submittedTimestamp;
  }

  // Generate the thumbnails for all items if they're new or have changed.

  if (!backendWork || (JSON.stringify(input.items) !== JSON.stringify(backendWork.items))) {
    for (const item of input.items) {
      const index: number = input.items.indexOf(item);

      const contentUrl: URL = new URL(item.url);

      let thumbnail: string | undefined = undefined;

      if (
        contentUrl.hostname.includes(env.CDN_HOSTNAME) && !contentUrl.pathname.includes(".mp3")
      ) {
        // Just generate a normal thumbnail. It is easily derived from the name.

        const [smallThumbnail, hiDpiThumbnail] = await uploadThumbnails(
          env, contentUrl, identifier
        );

        input.items[index].smallThumbnail = smallThumbnail;
        input.items[index].hiDpiThumbnail = hiDpiThumbnail;
      } else if (!contentUrl.pathname.includes(".mp3")) {
        // This is a URL, we should get the meta preview image and crop it.

        thumbnail = await scrapeThumbnail(contentUrl);

        if (thumbnail) {
          // The meta image might be completely the wrong size. We need to re-upload.

          const [smallThumbnail, hiDpiThumbnail] = await uploadScrapedThumbnail(
            env, identifier, thumbnail, item.url
          );

          input.items[index].meta = thumbnail;
          input.items[index].smallThumbnail = smallThumbnail;
          input.items[index].hiDpiThumbnail = hiDpiThumbnail;
        }
      } else {
        input.items[index].smallThumbnail = "/placeholders/audio_submission.png";
        input.items[index].hiDpiThumbnail = "/placeholders/audio_submission.png";
      }
    }
  }

  // Find the thumbnail for the main post if it's not explicitly provided.

  if (!input.thumbnailUrl) {
    const smallThumbnails = Object.values(input.items).map((item: UrlItem) => item.smallThumbnail);
    const thumbnails = Object.values(input.items).map((item: UrlItem) => item.hiDpiThumbnail);

    // Allow explosion.

    if (thumbnails.length > 0) {
      input.thumbnailUrl = thumbnails[0];
      input.smallThumbnailUrl = smallThumbnails[0];

      const noPlaceholders = thumbnails.filter(
        (url: string | undefined) => url && !url.includes("placeholder")
      );

      if (thumbnails.length > 1 && noPlaceholders.length > 0 && noPlaceholders) {
        input.thumbnailUrl = noPlaceholders[0];
        input.smallThumbnailUrl = noPlaceholders[0];
      }
    }
  }

  // Post/Edit the Discord ID for this work (can fail without 500).

  const hadDiscordIdAlready = !!input.discordId;

  const discordId: string | null = await postOrEditDiscordWork(env, input);
  if (discordId) {
    input.discordId = discordId;
  }

  await placeWork(env.REFRESH_KV, input, !hadDiscordIdAlready);

  return createJsonResponse(JSON.stringify(input), env.ALLOWED_ORIGIN);
};

/**
 * Request and return a short-term pre-signed upload URL.
 *
 * Note that in order for the URL to work on the frontend, a PUT request must include the header
 * `X-Amz-Content-Sha256` with a value of "UNSIGNED-PAYLOAD" indicating the upload would happen
 * after the URL is retrieved rather than in this handler.
 *
 * The content length is also explicitly required and must exactly match what is sent to this
 * endpoint or the request will fail.
 *
 * @param {Environment} env the workers environment
 * @param {Request} request the request
 * @param {string | undefined} identifier the identifier of the calling user
 * @returns {Promise<Response>} a response with a pre-signed upload URL
 */
export const postUpload = async (
  env: Environment, request: Request, identifier: string | undefined,
): Promise<Response> => {
  if (!identifier) {
    return createForbiddenResponse(env.ALLOWED_ORIGIN);
  }

  const requestData: { filename: string; contentLength: number } = await request.json();

  const _filename = requestData.filename;
  const _filenameParts = _filename.split(".");
  const extension: string = _filenameParts[_filenameParts.length - 1];

  if (_filenameParts.length < 2) {
    return createBadRequestResponse(new ValidationError(
      "This doesn't seem to be a file. Does it have a file extension?",
      null,
      [],
    ), env.ALLOWED_ORIGIN);
  }

  // Prevent legitimate users from uploading a file that is too large.

  const contentLength = requestData.contentLength;
  if (contentLength > MAXIMUM_CONTENT_LENGTH) {
    return createBadRequestResponse(new ValidationError(
      "File to be uploaded is too large.",
      null,
      [],
    ), env.ALLOWED_ORIGIN);
  }

  // Set up the AWS/S3 integration (actually B2).

  const aws: AwsClient = new AwsClient({
    "accessKeyId": env.AWS_ACCESS_KEY_ID,
    "secretAccessKey": env.AWS_SECRET_ACCESS_KEY,
    "region": env.AWS_DEFAULT_REGION,
  });

  const url = new URL(
    `https://${env.AWS_S3_BUCKET}/ugc/${identifier}/${crypto.randomUUID()}.${extension}`,
  );

  url.searchParams.set("X-Amz-Expires", UPLOAD_EXPIRY.toString());

  const signedRequest: Request = await aws.sign(
    url, {
      method: "PUT",
      headers: {"Content-Length": contentLength.toString()},
      aws: {
        service: "s3", signQuery: true, allHeaders: true,
      },
    }
  );

  return createJsonResponse(JSON.stringify(
    {
      data: {url: signedRequest.url},
    }
  ), env.ALLOWED_ORIGIN);
};

/**
 * The single state changes that can happen on any post but only if triggered by an admin.
 */
enum PrivilegedStateChange {
  APPROVE,
  UN_APPROVE,
  DELETE,
}

/**
 * Make one of the generic privileged state changes to a work.
 *
 * The request body contains all the work IDs to be changed. In order to avoid race conditions,
 * the mutations happens one by one and then is updated with whatever the backend states on
 * request for the aggregated writes.
 *
 * @param {Environment} env the workers environment
 * @param {Request} request the request
 * @param {PrivilegedStateChange} state the state change options enum
 * @param {string | undefined} identifier the identifier of the calling user
 * @returns {Promise<Response>} a response with a pre-signed upload URL
 */
const makePrivilegedStateChange = async (
  env: Environment, request: Request, state: PrivilegedStateChange, identifier: string | undefined,
): Promise<Response> => {
  // User must be staff to make any state change to a work

  const isStaff: boolean = identifier ? EDITORS.includes(identifier) : false;
  if (!isStaff) {
    return createForbiddenResponse(env.ALLOWED_ORIGIN);
  }

  // State change is always applied to multiple IDs found in the request body.

  const ids: string[] = await request.json();

  // Perform the actual state change.

  const works: Work[] = [];
  for (const id of ids) {
    // Allow explosion if work can't be found.

    const work: Work = JSON.parse(
      (await env.REFRESH_KV.get(`${WORKS_WITH_ID_INDEX}/${id}`)) || "{}"
    );

    switch (state) {
      case PrivilegedStateChange.APPROVE:
        work.isApproved = true;

        break;
      case PrivilegedStateChange.DELETE:
        work.isSoftDeleted = true;

        break;
      case PrivilegedStateChange.UN_APPROVE:
        // Doubtful this will be used, but it is here for completeness.

        work.isApproved = false;

        break;
    }

    // Edit the post, write to ID, and to weeks and artist aggregates, but not the main list.

    await placeWork(
      env.REFRESH_KV, work, false, false, false, true
    );

    works.push(work);
  }

  // Read from the list of everything (the only thing left), merge with the new values, then write.

  const worksWithoutIndex: Work[] = JSON.parse(
    await env.REFRESH_KV.get(`${WORKS_WITHOUT_INDEX}`) || "[]"
  );

  const idToAllWorks: Record<string, Work> = Object.fromEntries(worksWithoutIndex.map(
    (work: Work) => [work.id, work]
  ));

  works.forEach((work: Work) => {
    idToAllWorks[work.id] = work;
  });

  await env.REFRESH_KV.put(WORKS_WITHOUT_INDEX, JSON.stringify(
    Object.values(idToAllWorks).sort((a: Work, b: Work) => {
      return new Date(b.submittedTimestamp).valueOf() - new Date(a.submittedTimestamp).valueOf();
    })
  ));

  return createJsonResponse("{}", env.ALLOWED_ORIGIN);
};

/**
 * Approve the given works.
 *
 * @param {Environment} env the workers environment
 * @param {Request} request the request
 * @param {string | undefined} identifier the identifier of the calling user
 * @returns {Promise<Response>} a response with a pre-signed upload URL
 */
export const postApprove = async (
  env: Environment, request: Request, identifier: string | undefined,
): Promise<Response> => {
  return makePrivilegedStateChange(env, request, PrivilegedStateChange.APPROVE, identifier);
};

/**
 * Soft-delete the given works.
 *
 * @param {Environment} env the workers environment
 * @param {Request} request the request
 * @param {string | undefined} identifier the identifier of the calling user
 * @returns {Promise<Response>} a response with a pre-signed upload URL
 */
export const deleteWork = async (
  env: Environment, request: Request, identifier: string | undefined,
): Promise<Response> => {
  return makePrivilegedStateChange(env, request, PrivilegedStateChange.DELETE, identifier);
};
