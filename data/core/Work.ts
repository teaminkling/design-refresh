/**
 * A work.
 */
import Joi from "joi";
import {LAST_ACTIVE_WEEK} from "../constants/setup";
import Artist, {ARTIST_SCHEMA} from "./Artist";

export interface UrlItem {
  url: string;

  /**
   * The meta image, if the original URL is just a link.
   */
  meta?: string;

  /**
   * The thumbnail for non hi-DPI screens.
   */
  smallThumbnail?: string;

  /**
   * The thumbnail for hi-DPI screens.
   */
  hiDpiThumbnail?: string;
}

export default interface Work {
  /**
   * The internal ID.
   */
  id: string;

  /**
   * The year in which this work was created.
   */
  year: number;

  /**
   * The week(s) for which this work is meant.
   *
   * There are frontend and backend validations for this to have at least one entry.
   */
  weekNumbers: number[];

  /**
   * The ID of the artist.
   */
  artistId: string;

  /**
   * The artist info when the work was submitted for the first time.
   *
   * This might not contain up-to-date information on the artist. It is exclusively used when
   * the frontend can't figure out who the poster of a work is or the backend needs to create a
   * user for the first time.
   */
  firstSeenArtistInfo?: Artist;

  /**
   * The title of the work.
   *
   * Max of 128 characters.
   */
  title: string;

  /**
   * The medium of the work.
   *
   * Max of 128 characters.
   */
  medium?: string;

  /**
   * The description of the work.
   *
   * Max of 1920 characters.
   */
  description: string;

  /**
   * A list of URLs related to the content of this work.
   *
   * Order matters and is represented in provided order on the frontend.
   */
  items: UrlItem[];

  /**
   * The thumbnail URL for lower DPI screens.
   */
  smallThumbnailUrl?: string;

  /**
   * The thumbnail URL.
   *
   * This is either uploaded manually by the user or generated by our data pipeline.
   */
  thumbnailUrl?: string;

  /**
   * Whether or not a post is approved.
   *
   * If the user is not authenticated and a staff user or the user who uploaded the post
   * themselves, these works typically won't appear.
   */
  isApproved: boolean;

  /**
   * The corresponding Discord post's ID, if it exists.
   */
  discordId?: string;

  /**
   * The mandatory submitted timestamp.
   */
  submittedTimestamp: string;
}

// Note: I can't find specifications for the length of a snowflake, so we limit it to 64 chars.

export const URL_ITEM_SCHEMA = Joi.object(
  {
    url: Joi.string().uri({allowRelative: false}).min(1).required(),
    meta: Joi.string().uri({allowRelative: false}).min(1).optional(),
    smallThumbnail: Joi.string().uri({allowRelative: false}).min(1).optional(),
    hiDpiThumbnail: Joi.string().uri({allowRelative: false}).min(1).optional(),
  }
);

export const WORK_SCHEMA = Joi.object(
  {
    id: Joi.string().min(4).max(12).required(),
    year: Joi.number().min(2022).max(2077).required(),
    weekNumbers: Joi.array().items(
      Joi.number().min(1).max(LAST_ACTIVE_WEEK),
    ).min(1).max(6).required(),
    artistId: Joi.string().alphanum().max(64).required(),
    firstSeenArtistInfo: ARTIST_SCHEMA.optional(),
    title: Joi.string().min(1).max(128).required(),
    medium: Joi.string().max(128).allow("").optional(),
    description: Joi.string().min(3).max(1920).required(),
    items: Joi.array().items(URL_ITEM_SCHEMA).min(1).required(),
    smallThumbnailUrl: Joi.string().uri().allow("").optional(),
    thumbnailUrl: Joi.string().uri().allow("").optional(),
    isApproved: Joi.boolean().required(),
    discordId: Joi.string().alphanum().max(64).allow("").optional(),
    submittedTimestamp: Joi.string().isoDate().required(),
  },
);
