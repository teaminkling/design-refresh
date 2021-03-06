import Joi from "joi";
import {LAST_ACTIVE_WEEK} from "../constants/setup";

/**
 * A week.
 */
export default interface Week {
  /**
   * The year number.
   */
  year: number;

  /**
   * The week number of this year.
   */
  week: number;

  /**
   * The theme short-name.
   */
  theme: string;

  /**
   * Trusted HTML information.
   */
  information: string;

  /**
   * Whether or not this week can be used to submit.
   */
  isPublished: boolean;

  /**
   * If present, the Discord post ID for this week's prompt.
   */
  discordId?: string;

  /**
   * A frontend-set value that indicates if a week needs to be edited.
   *
   * Not stored by the backend. The backend just checks this value and if it's `true`, it will
   * perform the usual API writes and Discord calls.
   */
  isUpdating?: boolean;
}

// Note: I can't find specifications for the length of a snowflake, so we limit it to 64 chars.

export const WEEK_SCHEMA = Joi.object(
  {
    year: Joi.number().integer().min(2022).max(2077).required(),
    week: Joi.number().integer().min(1).max(LAST_ACTIVE_WEEK).required(),
    theme: Joi.string().max(256).allow("").optional(),
    information: Joi.string().max(16384).allow("").optional(),
    isPublished: Joi.boolean().required(),
    discordId: Joi.string().alphanum().max(64).allow("").optional(),
    isUpdating: Joi.boolean().optional(),
  },
);
